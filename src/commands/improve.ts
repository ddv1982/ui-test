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
    .option(
      "--output <path>",
      "Write improved YAML to a custom path (default: <input>.improved.yaml)"
    )
    .option("--in-place", "Overwrite the input YAML test file when applying")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic or snapshot-native"
    )
    .option(
      "--assertion-policy <policy>",
      "Assertion policy: reliable, balanced, or aggressive"
    )
    .option("--plan", "Generate a reviewable improve plan without writing YAML")
    .option("--apply-plan <path>", "Apply a previously generated improve plan JSON")
    .option("--report <path>", "Write JSON report to a custom path")
    .option("--load-storage <path>", "Apply Playwright storage state JSON to improve browser contexts")
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
  const output = asOptionalString(value.output);
  const inPlace = asOptionalBoolean(value.inPlace);
  const assertions = asOptionalString(value.assertions);
  const assertionSource = asOptionalString(value.assertionSource);
  const assertionPolicy = asOptionalString(value.assertionPolicy);
  const plan = asOptionalBoolean(value.plan);
  const applyPlan = asOptionalString(value.applyPlan);
  const report = asOptionalString(value.report);
  const loadStorage = asOptionalString(value.loadStorage);

  if (apply !== undefined) out.apply = apply;
  if (output !== undefined) out.output = output;
  if (inPlace !== undefined) out.inPlace = inPlace;
  if (assertions !== undefined) out.assertions = assertions;
  if (assertionSource !== undefined) out.assertionSource = assertionSource;
  if (assertionPolicy !== undefined) out.assertionPolicy = assertionPolicy;
  if (plan !== undefined) out.plan = plan;
  if (applyPlan !== undefined) out.applyPlan = applyPlan;
  if (report !== undefined) out.report = report;
  if (loadStorage !== undefined) out.loadStorage = loadStorage;

  return out;
}

interface RawImproveCliOptions {
  apply?: unknown;
  output?: unknown;
  inPlace?: unknown;
  assertions?: unknown;
  assertionSource?: unknown;
  assertionPolicy?: unknown;
  plan?: unknown;
  applyPlan?: unknown;
  report?: unknown;
  loadStorage?: unknown;
}

function isRawImproveCliOptions(value: unknown): value is RawImproveCliOptions {
  return value !== null && typeof value === "object";
}
