import type { Command } from "commander";
import { handleError } from "../utils/errors.js";
import { runRecord, type RecordCliOptions } from "../app/services/record-service.js";
import { asOptionalBoolean, asOptionalString } from "./parse-helpers.js";

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
    .option("--no-improve", "Skip automatic improvement after recording")
    .action(async (opts: unknown) => {
      try {
        await runRecord(parseRecordCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

function parseRecordCliOptions(value: unknown): RecordCliOptions {
  if (!isRawRecordCliOptions(value)) return {};
  const out: RecordCliOptions = {};

  const name = asOptionalString(value.name);
  const url = asOptionalString(value.url);
  const description = asOptionalString(value.description);
  const outputDir = asOptionalString(value.outputDir);
  const selectorPolicy = asOptionalString(value.selectorPolicy);
  const browser = asOptionalString(value.browser);
  const device = asOptionalString(value.device);
  const testIdAttribute = asOptionalString(value.testIdAttribute);
  const loadStorage = asOptionalString(value.loadStorage);
  const saveStorage = asOptionalString(value.saveStorage);
  const improve = asOptionalBoolean(value.improve);

  if (name !== undefined) out.name = name;
  if (url !== undefined) out.url = url;
  if (description !== undefined) out.description = description;
  if (outputDir !== undefined) out.outputDir = outputDir;
  if (selectorPolicy !== undefined) out.selectorPolicy = selectorPolicy;
  if (browser !== undefined) out.browser = browser;
  if (device !== undefined) out.device = device;
  if (testIdAttribute !== undefined) out.testIdAttribute = testIdAttribute;
  if (loadStorage !== undefined) out.loadStorage = loadStorage;
  if (saveStorage !== undefined) out.saveStorage = saveStorage;
  if (improve !== undefined) out.improve = improve;

  return out;
}

interface RawRecordCliOptions {
  name?: unknown;
  url?: unknown;
  description?: unknown;
  outputDir?: unknown;
  selectorPolicy?: unknown;
  browser?: unknown;
  device?: unknown;
  testIdAttribute?: unknown;
  loadStorage?: unknown;
  saveStorage?: unknown;
  improve?: unknown;
}

function isRawRecordCliOptions(value: unknown): value is RawRecordCliOptions {
  return value !== null && typeof value === "object";
}
