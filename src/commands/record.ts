import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { record as runRecording } from "../core/recorder.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";
import {
  hasUrlProtocol,
  normalizeRecordUrl,
  resolveRecordProfile,
} from "../app/options/record-profile.js";
import { formatRecordingProfileSummary } from "../app/options/profile-summary.js";

interface RecordCliOptions {
  name?: string;
  url?: string;
  description?: string;
  selectorPolicy?: string;
  browser?: string;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export function registerRecord(program: Command) {
  program
    .command("record")
    .description("Record browser interactions and save as a YAML test")
    .option("-n, --name <name>", "Test name")
    .option("-u, --url <url>", "Starting URL")
    .option("-d, --description <desc>", "Test description")
    .option("--selector-policy <policy>", "Selector policy: reliable or raw")
    .option("--browser <browser>", "Browser: chromium, firefox, or webkit")
    .option("--device <name>", "Playwright device name")
    .option("--test-id-attribute <attr>", "Custom test-id attribute")
    .option("--load-storage <path>", "Path to storage state to preload")
    .option("--save-storage <path>", "Path to write resulting storage state")
    .action(async (opts: unknown) => {
      try {
        await runRecord(parseRecordCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runRecord(opts: RecordCliOptions) {
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

  const profile = resolveRecordProfile(opts, config);

  ui.info(
    formatRecordingProfileSummary({
      browser: profile.browser,
      selectorPolicy: profile.selectorPolicy,
      device: profile.device,
      testIdAttribute: profile.testIdAttribute,
      loadStorage: profile.loadStorage,
      saveStorage: profile.saveStorage,
    })
  );

  const result = await runRecording({
    name,
    url,
    description: description || undefined,
    outputDir: profile.outputDir,
    selectorPolicy: profile.selectorPolicy,
    browser: profile.browser,
    device: profile.device,
    testIdAttribute: profile.testIdAttribute,
    loadStorage: profile.loadStorage,
    saveStorage: profile.saveStorage,
  });

  console.log();
  ui.success(`Test saved to ${result.outputPath}`);
  ui.info(
    `Recording mode: ${result.recordingMode}${result.degraded ? " (degraded fidelity)" : ""}`
  );
  ui.info(
    `Selector quality: stable=${result.stats.stableSelectors}, fallback=${result.stats.fallbackSelectors}, frame-aware=${result.stats.frameAwareSelectors}`
  );
  ui.info("Run it with: ui-test play " + result.outputPath);
}

function parseRecordCliOptions(value: unknown): RecordCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    name: asOptionalString(record.name),
    url: asOptionalString(record.url),
    description: asOptionalString(record.description),
    selectorPolicy: asOptionalString(record.selectorPolicy),
    browser: asOptionalString(record.browser),
    device: asOptionalString(record.device),
    testIdAttribute: asOptionalString(record.testIdAttribute),
    loadStorage: asOptionalString(record.loadStorage),
    saveStorage: asOptionalString(record.saveStorage),
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
