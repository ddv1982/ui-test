import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { record as runRecording } from "../core/recorder.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";

export function registerRecord(program: Command) {
  program
    .command("record")
    .description("Record browser interactions and save as a YAML test")
    .option("-n, --name <name>", "Test name")
    .option("-u, --url <url>", "Starting URL")
    .option("-d, --description <desc>", "Test description")
    .action(async (opts) => {
      try {
        await runRecord(opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runRecord(opts: {
  name?: string;
  url?: string;
  description?: string;
}) {
  const config = await loadConfig();

  const name =
    opts.name ??
    (await input({
      message: "Test name:",
      validate: (v) => (v.trim().length > 0 ? true : "Name is required"),
    }));

  const rawUrl =
    opts.url ??
    (await input({
      message: "Starting URL:",
      default: config.baseUrl ?? "http://localhost:3000",
      validate: (value) => {
        try {
          normalizeRecordUrl(value);
          return true;
        } catch (err) {
          if (err instanceof UserError && err.hint) {
            return `${err.message} ${err.hint}`;
          }
          return err instanceof Error ? err.message : "Invalid URL";
        }
      },
    }));
  const url = normalizeRecordUrl(rawUrl);
  if (rawUrl.trim() !== url.trim() && !hasUrlProtocol(rawUrl.trim())) {
    ui.info(`No protocol provided; using ${url}`);
  }

  const description =
    opts.description ??
    (await input({
      message: "Description (optional):",
    }));

  const outputPath = await runRecording({
    name,
    url,
    description: description || undefined,
    outputDir: config.testDir ?? "e2e",
  });

  console.log();
  ui.success(`Test saved to ${outputPath}`);
  ui.info("Run it with: npx ui-test play " + outputPath);
}

const PROTOCOL_PREFIX = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

function hasUrlProtocol(value: string): boolean {
  return PROTOCOL_PREFIX.test(value);
}

function normalizeRecordUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new UserError("Starting URL is required.");
  }
  if (looksLikeHttpSchemeTypo(trimmed)) {
    throw new UserError(
      `Invalid starting URL: ${value}`,
      "Use a full URL like http://localhost:3000 or https://example.com"
    );
  }

  let candidate = trimmed;
  if (!hasUrlProtocol(trimmed)) {
    const defaultScheme = inferDefaultScheme(trimmed);
    if (!defaultScheme) {
      throw new UserError(
        `Invalid starting URL: ${value}`,
        "For non-local domains, include http:// or https:// explicitly"
      );
    }
    candidate = `${defaultScheme}://${trimmed}`;
  }
  try {
    return new URL(candidate).toString();
  } catch {
    throw new UserError(
      `Invalid starting URL: ${value}`,
      "Use a valid URL like https://example.com or http://localhost:3000"
    );
  }
}

function looksLikeHttpSchemeTypo(value: string): boolean {
  return (
    /^https?\/\/.+/i.test(value) ||
    /^https?:\/(?!\/).+/i.test(value) ||
    /^https?:[^/].+/i.test(value)
  );
}

function inferDefaultScheme(schemeLessUrl: string): "http" | "https" | null {
  const parsed = tryParseSchemeLessUrl(schemeLessUrl);
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (isLocalHostname(host) || isPrivateIpv4(host)) {
    return "http";
  }

  return "https";
}

function tryParseSchemeLessUrl(value: string): URL | null {
  try {
    return new URL(`http://${value}`);
  } catch {
    return null;
  }
}

function isLocalHostname(host: string): boolean {
  const normalizedHost = host.replace(/^\[(.*)\]$/, "$1");
  if (normalizedHost === "localhost" || normalizedHost === "::1" || normalizedHost === "127.0.0.1") {
    return true;
  }
  if (normalizedHost.endsWith(".local")) {
    return true;
  }
  if (!normalizedHost.includes(".") && !normalizedHost.includes(":")) {
    return true;
  }
  return false;
}

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export { normalizeRecordUrl };
