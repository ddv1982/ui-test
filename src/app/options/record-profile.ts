import type { RecordBrowser } from "../../core/recorder.js";
import { PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { UserError } from "../../utils/errors.js";

export interface RecordProfileInput {
  browser?: string;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
  outputDir?: string;
}

export interface ResolvedRecordProfile {
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
  const profile: ResolvedRecordProfile = {
    browser: parseRecordBrowser(input.browser) ?? "chromium",
    outputDir: input.outputDir ?? PLAY_DEFAULT_TEST_DIR,
  };

  const device = cleanOptional(input.device);
  const testIdAttribute = cleanOptional(input.testIdAttribute);
  const loadStorage = cleanOptional(input.loadStorage);
  const saveStorage = cleanOptional(input.saveStorage);

  if (device !== undefined) profile.device = device;
  if (testIdAttribute !== undefined) profile.testIdAttribute = testIdAttribute;
  if (loadStorage !== undefined) profile.loadStorage = loadStorage;
  if (saveStorage !== undefined) profile.saveStorage = saveStorage;

  return profile;
}

function cleanOptional(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

  const a = octets[0];
  const b = octets[1];
  if (a === undefined || b === undefined) {
    return false;
  }
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
