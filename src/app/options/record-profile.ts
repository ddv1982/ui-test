import type { RecordBrowser } from "../../core/recorder.js";
import { PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { UserError } from "../../utils/errors.js";

export type SelectorPolicy = "reliable" | "raw";

export interface RecordProfileInput {
  selectorPolicy?: string;
  browser?: string;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
  outputDir?: string;
}

export interface ResolvedRecordProfile {
  selectorPolicy: SelectorPolicy;
  browser: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
  outputDir: string;
}

export function resolveRecordProfile(
  input: RecordProfileInput
): ResolvedRecordProfile {
  return {
    selectorPolicy: parseSelectorPolicy(input.selectorPolicy) ?? "reliable",
    browser: parseRecordBrowser(input.browser) ?? "chromium",
    device: cleanOptional(input.device),
    testIdAttribute: cleanOptional(input.testIdAttribute),
    loadStorage: cleanOptional(input.loadStorage),
    saveStorage: cleanOptional(input.saveStorage),
    outputDir: input.outputDir ?? PLAY_DEFAULT_TEST_DIR,
  };
}

function cleanOptional(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseSelectorPolicy(value: string | undefined): SelectorPolicy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "reliable" || normalized === "raw") {
    return normalized;
  }
  throw new UserError(
    `Invalid selector policy: ${value}`,
    "Use --selector-policy reliable or --selector-policy raw"
  );
}

export function parseRecordBrowser(value: string | undefined): RecordBrowser | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "chromium" || normalized === "firefox" || normalized === "webkit") {
    return normalized;
  }
  throw new UserError(
    `Invalid browser: ${value}`,
    "Use --browser chromium, --browser firefox, or --browser webkit"
  );
}

const PROTOCOL_PREFIX = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

export function normalizeRecordUrl(value: string): string {
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

export function hasUrlProtocol(value: string): boolean {
  return PROTOCOL_PREFIX.test(value);
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
