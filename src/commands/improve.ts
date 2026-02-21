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
    .option("--no-apply", "Report only — do not modify the test file")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic or snapshot-native"
    )
    .option(
      "--assertion-policy <policy>",
      "Assertion policy: reliable, balanced, or aggressive"
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
  if (!isRawImproveCliOptions(value)) return {};
  const out: ImproveCliOptions = {};
  const apply = asOptionalBoolean(value.apply);
  const assertions = asOptionalString(value.assertions);
  const assertionSource = asOptionalString(value.assertionSource);
  const assertionPolicy = asOptionalString(value.assertionPolicy);
  const report = asOptionalString(value.report);

  if (apply !== undefined) out.apply = apply;
  if (assertions !== undefined) out.assertions = assertions;
  if (assertionSource !== undefined) out.assertionSource = assertionSource;
  if (assertionPolicy !== undefined) out.assertionPolicy = assertionPolicy;
  if (report !== undefined) out.report = report;

  return out;
}

interface RawImproveCliOptions {
  apply?: unknown;
  assertions?: unknown;
  assertionSource?: unknown;
  assertionPolicy?: unknown;
  report?: unknown;
}

function isRawImproveCliOptions(value: unknown): value is RawImproveCliOptions {
  return value !== null && typeof value === "object";
}
