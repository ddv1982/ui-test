import type { Command } from "commander";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleError, UserError } from "../utils/errors.js";

const MIN_NODE_MAJOR = 18;
const require = createRequire(import.meta.url);

const HELP_TEXT = `
ui-test bootstrap

Usage:
  npx ui-test bootstrap [mode] [options]

Modes:
  install       Install project dependencies and Playwright-CLI tooling
  setup         Run ui-test setup (passes through args to "ui-test setup")
  quickstart    Run install + setup (default mode). Add --run-play to execute "ui-test play"

Options:
  --run-play    (quickstart only) run "ui-test play" after setup
  -h, --help    Show help

Examples:
  npx ui-test bootstrap install
  npx ui-test bootstrap setup --force-init
  npx ui-test bootstrap quickstart --run-play
  npx ui-test bootstrap quickstart -- --skip-browser-install
  npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
`.trim();

type BootstrapMode = "install" | "setup" | "quickstart";

interface ParsedBootstrapArgs {
  mode: BootstrapMode;
  runPlay: boolean;
  setupArgs: string[];
  showHelp: boolean;
}

export function registerBootstrap(program: Command) {
  program
    .command("bootstrap [mode] [args...]")
    .description("Install dependencies and run setup/play for first-time onboarding")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action((_mode: unknown, _args: unknown, command: Command) => {
      try {
        runBootstrap(extractRawBootstrapArgs(command));
      } catch (err) {
        handleError(err);
      }
    });
}

function extractRawBootstrapArgs(command: Command): string[] {
  void command;
  const rawArgs = process.argv;
  const commandIndex = rawArgs.indexOf("bootstrap");
  return commandIndex === -1 ? [] : rawArgs.slice(commandIndex + 1);
}

function runBootstrap(argv: string[]): void {
  ensureNodeVersion();
  const parsed = parseBootstrapArgs(argv);

  if (parsed.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  if (parsed.mode === "install") {
    runInstallDependencies();
    runInstallPlaywrightCli();
    return;
  }

  if (parsed.mode === "setup") {
    runUiTestSetup(parsed.setupArgs);
    return;
  }

  runInstallDependencies();
  runInstallPlaywrightCli();
  runUiTestSetup(parsed.setupArgs);
  if (parsed.runPlay) {
    runUiTestPlay();
  }
}

function parseBootstrapArgs(argv: string[]): ParsedBootstrapArgs {
  let mode: BootstrapMode = "quickstart";
  let rest = argv;

  const maybeMode = argv[0];
  if (maybeMode && !maybeMode.startsWith("-")) {
    if (maybeMode !== "install" && maybeMode !== "setup" && maybeMode !== "quickstart") {
      throw new UserError(`Unknown mode: ${maybeMode}`);
    }
    mode = maybeMode;
    rest = argv.slice(1);
  }

  if (mode === "setup") {
    return {
      mode,
      runPlay: false,
      setupArgs: rest,
      showHelp: false,
    };
  }

  if (mode === "install") {
    if (rest.includes("-h") || rest.includes("--help")) {
      return {
        mode,
        runPlay: false,
        setupArgs: [],
        showHelp: true,
      };
    }

    if (rest.length > 0) {
      throw new UserError("install mode does not accept extra arguments.");
    }
    return {
      mode,
      runPlay: false,
      setupArgs: [],
      showHelp: false,
    };
  }

  const separatorIndex = rest.indexOf("--");
  const quickstartOptions = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
  const setupArgs = separatorIndex === -1 ? [] : rest.slice(separatorIndex + 1);

  if (quickstartOptions.includes("-h") || quickstartOptions.includes("--help")) {
    return {
      mode,
      runPlay: false,
      setupArgs: [],
      showHelp: true,
    };
  }

  let runPlay = false;
  for (const option of quickstartOptions) {
    if (option === "--run-play") {
      runPlay = true;
      continue;
    }
    throw new UserError(
      `Unknown quickstart option: ${option}. Use "--" before setup flags.`
    );
  }

  return {
    mode,
    runPlay,
    setupArgs,
    showHelp: false,
  };
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new UserError(
      `Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${process.versions.node}`
    );
  }
}

function runInstallDependencies() {
  ensureCommandAvailable("npm");
  const installArgs = resolveInstallArgs();
  runCommand(
    `Install dependencies (npm ${installArgs.join(" ")})`,
    "npm",
    installArgs
  );
}

function resolveInstallArgs() {
  const lockFilePath = path.resolve("package-lock.json");
  return existsSync(lockFilePath) ? ["ci"] : ["install"];
}

function runUiTestSetup(setupArgs: string[]) {
  runCommand(
    `Run ui-test setup${setupArgs.length > 0 ? ` ${setupArgs.join(" ")}` : ""}`,
    process.execPath,
    [resolveUiTestCliEntry(), "setup", ...setupArgs]
  );
}

function runUiTestPlay() {
  runCommand("Run ui-test play", process.execPath, [resolveUiTestCliEntry(), "play"]);
}

function resolveUiTestCliEntry(): string {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(commandsDir, "..", "bin", "ui-test.js");
}

function runInstallPlaywrightCli() {
  ensureCommandAvailable("npx");
  const cliVersion = resolvePlaywrightVersion();
  try {
    runCommand(
      `Install/verify Playwright-CLI (@${cliVersion})`,
      "npx",
      ["-y", `@playwright/cli@${cliVersion}`, "--help"]
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[bootstrap] WARN: ${message} ` +
      `Retry manually: npx -y @playwright/cli@${cliVersion} --help. ` +
      "Continuing because Playwright-CLI is only required for improve --assertion-source snapshot-cli."
    );
    return false;
  }
}

function resolvePlaywrightVersion() {
  let manifestPath: string;
  try {
    manifestPath = require.resolve("playwright/package.json");
  } catch {
    throw new UserError(
      "Could not resolve installed Playwright version. Install dependencies first."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(`Failed to read Playwright package metadata: ${message}`);
  }

  const version =
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
      ? parsed.version.trim()
      : "";

  if (!/^\d+\.\d+\.\d+(-.+)?$/u.test(version)) {
    throw new UserError(`Invalid installed Playwright version: ${version || "(empty)"}`);
  }

  return version;
}

function ensureCommandAvailable(command: string) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error || result.status !== 0) {
    throw new UserError(
      `Required command "${command}" is unavailable in PATH.`
    );
  }
}

function runCommand(label: string, command: string, args: string[]) {
  console.log(`[bootstrap] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new UserError(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new UserError(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

export {
  parseBootstrapArgs,
  resolveInstallArgs,
  resolvePlaywrightVersion,
  resolveUiTestCliEntry,
  runBootstrap,
  runInstallPlaywrightCli,
};
