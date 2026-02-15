import type { Command } from "commander";
import { handleError } from "../utils/errors.js";
import { runImprove, type ImproveCliOptions } from "../app/services/improve-service.js";
import {
  asOptionalBoolean,
  asOptionalString,
  parseRequiredArgument,
} from "./parse-helpers.js";

export function registerImprove(program: Command) {
  program
    .command("improve")
    .description("Analyze and improve recorded selectors")
    .argument("<test-file>", "Path to the YAML test file to analyze")
    .option("--apply", "Apply all improvements (selectors and assertions)")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic, snapshot-cli (requires playwright-cli), or snapshot-native"
    )
    .option("--report <path>", "Write JSON report to a custom path")
    .action(async (testFile: unknown, opts: unknown) => {
      try {
        await runImprove(
          parseRequiredArgument(testFile, "test-file"),
          parseImproveCliOptions(opts)
        );
      } catch (err) {
        handleError(err);
      }
    });
}

function parseImproveCliOptions(value: unknown): ImproveCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    apply: asOptionalBoolean(record.apply),
    assertions: asOptionalString(record.assertions),
    assertionSource: asOptionalString(record.assertionSource),
    report: asOptionalString(record.report),
  };
}
