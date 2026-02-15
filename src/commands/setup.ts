import type { Command } from "commander";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runOnboardingPlan,
  type SetupMode,
  resolveInstallArgs,
  runInstallPlaywrightCli,
} from "../app/services/onboarding-service.js";
import { handleError, UserError } from "../utils/errors.js";
import { asOptionalBoolean } from "./parse-helpers.js";

const MIN_NODE_MAJOR = 18;

const HELP_APPENDIX = [
  "",
  "Modes:",
  "  install       Install project dependencies and Playwright-CLI tooling",
  '  quickstart    Run install + Chromium provisioning (default mode). Add --run-play to execute "ui-test play e2e/example.yaml"',
  "",
  "Examples:",
  "  ui-test setup install",
  "  ui-test setup quickstart --run-play",
  "",
  "One-off fallback:",
  "  npx -y github:ddv1982/easy-e2e-testing setup quickstart",
].join("\n");

export interface SetupCliOptions {
  runPlay?: boolean;
}

export function registerSetup(program: Command) {
  program
    .command("setup [mode]")
    .description("Install dependencies and run onboarding/play for first-time setup")
    .option("--run-play", "Run ui-test play e2e/example.yaml after quickstart onboarding")
    .addHelpText("after", HELP_APPENDIX)
    .action(async (mode: unknown, opts: unknown) => {
      try {
        await runSetup(mode, parseSetupCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

export async function runSetup(modeInput: unknown, opts: SetupCliOptions): Promise<void> {
  ensureNodeVersion();
  const mode = parseSetupMode(modeInput);
  const runPlay = opts.runPlay ?? false;

  if (mode === "install" && runPlay) {
    throw new UserError("install mode does not support --run-play.");
  }

  await runOnboardingPlan(
    {
      mode,
      runPlay,
    },
    {
      uiTestCliEntry: resolveUiTestCliEntry(),
    }
  );

  printSetupNextSteps(mode, runPlay);
}

function parseSetupCliOptions(value: unknown): SetupCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    runPlay: asOptionalBoolean(record.runPlay),
  };
}

function parseSetupMode(modeInput: unknown): SetupMode {
  if (typeof modeInput !== "string" || modeInput.trim().length === 0) {
    return "quickstart";
  }

  const normalized = modeInput.trim().toLowerCase();
  if (normalized === "install" || normalized === "quickstart") {
    return normalized;
  }

  throw new UserError(`Unknown mode: ${modeInput}`);
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new UserError(
      `Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${process.versions.node}`
    );
  }
}

function resolveUiTestCliEntry(): string {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(commandsDir, "..", "bin", "ui-test.js");
}

function printSetupNextSteps(mode: SetupMode, runPlay: boolean) {
  if (mode !== "quickstart") {
    return;
  }

  console.log("");
  console.log("✔ Setup complete.");
  console.log("");

  if (runPlay) {
    console.log("Tip: Explore all options with ui-test --help.");
    return;
  }

  console.log("Next:");
  console.log("  ui-test play");
  console.log("  ui-test --help");
}

export {
  parseSetupMode,
  printSetupNextSteps,
  resolveInstallArgs,
  resolveUiTestCliEntry,
  runInstallPlaywrightCli,
};
