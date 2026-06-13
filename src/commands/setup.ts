import type { Command } from "commander";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkbox } from "@inquirer/prompts";
import {
  runOnboardingPlan,
  ALL_PLAYWRIGHT_BROWSERS,
  validateBrowserName,
  type PlaywrightBrowser,
} from "../app/services/onboarding-service.js";
import { handleError, UserError } from "../utils/errors.js";
import { asOptionalBoolean, asOptionalString } from "./parse-helpers.js";

const MIN_NODE_MAJOR = 20;
const MIN_NODE_MINOR = 12;

const HELP_APPENDIX = [
  "",
  "Examples:",
  "  ui-test setup                          Interactive browser selection",
  "  ui-test setup --browsers chromium      Non-interactive (CI-friendly)",
  "  ui-test setup --browsers chromium,firefox",
  "  ui-test setup --run-play               Also run example test after setup",
].join("\n");

export interface SetupCliOptions {
  runPlay?: boolean;
  browsers?: string;
}

export function registerSetup(program: Command) {
  program
    .command("setup")
    .description("Provision browsers and run onboarding")
    .option("--browsers <list>", "Comma-separated browsers to install: chromium, firefox, webkit")
    .option("--run-play", "Run ui-test play e2e/example.yaml after setup")
    .addHelpText("after", HELP_APPENDIX)
    .action(async (opts: unknown) => {
      try {
        await runSetup(parseSetupCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

export async function runSetup(opts: SetupCliOptions): Promise<void> {
  ensureNodeVersion();
  const browsers = await resolveBrowsers(opts.browsers);
  const runPlay = opts.runPlay ?? false;

  await runOnboardingPlan(
    { browsers, runPlay },
    { uiTestCliEntry: resolveUiTestCliEntry() }
  );

  printSetupNextSteps(runPlay);
}

export async function resolveBrowsers(
  browsersFlag: string | undefined
): Promise<PlaywrightBrowser[]> {
  if (browsersFlag !== undefined) {
    return parseBrowsersFlag(browsersFlag);
  }

  const selected = await checkbox<PlaywrightBrowser>({
    message: "Which browsers do you want to install?",
    choices: ALL_PLAYWRIGHT_BROWSERS.map((b) => ({
      name: b,
      value: b,
      checked: b === "chromium",
    })),
    required: true,
  });

  return selected;
}

export function parseBrowsersFlag(input: string): PlaywrightBrowser[] {
  const raw = input.split(",").map((s) => s.trim()).filter(Boolean);

  if (raw.length === 0) {
    throw new UserError(
      "No browsers specified.",
      "Use --browsers chromium,firefox,webkit"
    );
  }

  const validated = raw.map((b) => validateBrowserName(b));
  return [...new Set(validated)];
}

function parseSetupCliOptions(value: unknown): SetupCliOptions {
  if (!isRawSetupCliOptions(value)) return {};
  const out: SetupCliOptions = {};
  const runPlay = asOptionalBoolean(value.runPlay);
  const browsers = asOptionalString(value.browsers);

  if (runPlay !== undefined) out.runPlay = runPlay;
  if (browsers !== undefined) out.browsers = browsers;

  return out;
}

export function ensureNodeVersion() {
  const [majorRaw, minorRaw] = process.versions.node.split(".");
  const major = Number(majorRaw ?? "0");
  const minor = Number(minorRaw ?? "0");
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    major < MIN_NODE_MAJOR ||
    (major === MIN_NODE_MAJOR && minor < MIN_NODE_MINOR)
  ) {
    throw new UserError(
      `Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required. Current version: ${process.versions.node}`
    );
  }
}

export function resolveUiTestCliEntry(): string {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(commandsDir, "..", "bin", "ui-test.js");
}

function printSetupNextSteps(runPlay: boolean) {
  console.log("");
  console.log("Setup complete.");
  console.log("");

  if (runPlay) {
    console.log("Tip: Explore all options with ui-test --help.");
    return;
  }

  console.log("Next:");
  console.log("  ui-test play");
  console.log("  ui-test --help");
}

interface RawSetupCliOptions {
  runPlay?: unknown;
  browsers?: unknown;
}

function isRawSetupCliOptions(value: unknown): value is RawSetupCliOptions {
  return value !== null && typeof value === "object";
}
