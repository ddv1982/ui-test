import type { Command } from "commander";
import { handleError } from "../utils/errors.js";
import { runPlay } from "../app/services/play-service.js";
import type { PlayProfileInput } from "../app/options/play-profile.js";
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
    .option("--browser <name>", "Browser to use: chromium, firefox, or webkit (default: chromium)")
    .option("--no-start", "Do not auto-start app before running tests")
    .action(async (testArg: unknown, opts: unknown) => {
      try {
        await runPlay(parseOptionalArgument(testArg), parsePlayProfileInput(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

function parsePlayProfileInput(value: unknown): PlayProfileInput {
  if (!isRawPlayProfileOptions(value)) return {};
  const out: PlayProfileInput = {};

  const headed = asOptionalBoolean(value.headed);
  const timeout = asOptionalString(value.timeout);
  const delay = asOptionalString(value.delay);
  const waitNetworkIdle = asOptionalBoolean(value.waitNetworkIdle);
  const saveFailureArtifacts = asOptionalBoolean(value.saveFailureArtifacts);
  const artifactsDir = asOptionalString(value.artifactsDir);
  const start = asOptionalBoolean(value.start);
  const browser = asOptionalString(value.browser);

  if (headed !== undefined) out.headed = headed;
  if (timeout !== undefined) out.timeout = timeout;
  if (delay !== undefined) out.delay = delay;
  if (waitNetworkIdle !== undefined) out.waitNetworkIdle = waitNetworkIdle;
  if (saveFailureArtifacts !== undefined) out.saveFailureArtifacts = saveFailureArtifacts;
  if (artifactsDir !== undefined) out.artifactsDir = artifactsDir;
  if (start !== undefined) out.start = start;
  if (browser !== undefined) out.browser = browser;

  return out;
}

export { runPlay };

interface RawPlayProfileOptions {
  headed?: unknown;
  timeout?: unknown;
  delay?: unknown;
  waitNetworkIdle?: unknown;
  saveFailureArtifacts?: unknown;
  artifactsDir?: unknown;
  start?: unknown;
  browser?: unknown;
}

function isRawPlayProfileOptions(value: unknown): value is RawPlayProfileOptions {
  return value !== null && typeof value === "object";
}
