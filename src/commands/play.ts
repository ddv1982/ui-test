import type { Command } from "commander";
import { handleError } from "../utils/errors.js";
import { runPlay, type PlayCliOptions } from "../app/services/play-service.js";
import {
  asOptionalBoolean,
  asOptionalString,
  parseOptionalArgument,
} from "./parse-helpers.js";

export function registerPlay(program: Command) {
  program
    .command("play")
    .description("Replay one or all YAML tests")
    .argument("[test]", "Path to a specific test file, or omit to run all")
    .option("--headed", "Run browser in headed mode (visible)")
    .option("--timeout <ms>", "Step timeout in milliseconds")
    .option("--delay <ms>", "Delay between steps in milliseconds")
    .option("--wait-network-idle", "Wait for network idle after each step")
    .option("--no-wait-network-idle", "Skip waiting for network idle after each step")
    .option("--save-failure-artifacts", "Save JSON/trace/screenshot artifacts on test failure")
    .option("--no-save-failure-artifacts", "Disable failure artifact capture")
    .option("--artifacts-dir <path>", "Directory for play failure artifacts")
    .option("--no-start", "Do not auto-start app before running tests")
    .action(async (testArg: unknown, opts: unknown) => {
      try {
        await runPlay(parseOptionalArgument(testArg), parsePlayCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

function parsePlayCliOptions(value: unknown): PlayCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    headed: asOptionalBoolean(record.headed),
    timeout: asOptionalString(record.timeout),
    delay: asOptionalString(record.delay),
    waitNetworkIdle: asOptionalBoolean(record.waitNetworkIdle),
    saveFailureArtifacts: asOptionalBoolean(record.saveFailureArtifacts),
    artifactsDir: asOptionalString(record.artifactsDir),
    start: asOptionalBoolean(record.start),
  };
}

export { runPlay };
