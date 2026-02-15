import type { Command } from "commander";
import { handleError } from "../utils/errors.js";
import { runRecord, type RecordCliOptions } from "../app/services/record-service.js";

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
    .option("-o, --output-dir <dir>", "Output directory for recorded test")
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

function parseRecordCliOptions(value: unknown): RecordCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    name: asOptionalString(record.name),
    url: asOptionalString(record.url),
    description: asOptionalString(record.description),
    outputDir: asOptionalString(record.outputDir),
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
