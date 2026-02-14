import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIN_NODE_MAJOR = 18;

const HELP_TEXT = `
ui-test bootstrap

Usage:
  node ./scripts/bootstrap.mjs [mode] [options]

Modes:
  install       Install dependencies and Playwright-CLI tooling
  setup         Run ui-test setup (passes through args to "npx ui-test setup")
  quickstart    Run install + setup (default mode). Add --run-play to execute "npx ui-test play"

Options:
  --run-play    (quickstart only) run "npx ui-test play" after setup
  -h, --help    Show help

Examples:
  node ./scripts/bootstrap.mjs install
  node ./scripts/bootstrap.mjs setup --force-init
  node ./scripts/bootstrap.mjs quickstart --run-play
  node ./scripts/bootstrap.mjs quickstart -- --skip-browser-install
`.trim();

function main() {
  try {
    ensureNodeVersion();
    const parsed = parseArgs(process.argv.slice(2));

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bootstrap] FAILED: ${message}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  let mode = "quickstart";
  let rest = argv;

  const maybeMode = argv[0];
  if (maybeMode && !maybeMode.startsWith("-")) {
    mode = maybeMode;
    rest = argv.slice(1);
  }

  if (!["install", "setup", "quickstart"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
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
      throw new Error("install mode does not accept extra arguments.");
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
    throw new Error(
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
    throw new Error(
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

function runUiTestSetup(setupArgs) {
  ensureCommandAvailable("npx");
  runCommand(
    `Run ui-test setup${setupArgs.length > 0 ? ` ${setupArgs.join(" ")}` : ""}`,
    "npx",
    ["ui-test", "setup", ...setupArgs]
  );
}

function runUiTestPlay() {
  runCommand("Run ui-test play", "npx", ["ui-test", "play"]);
}

function runInstallPlaywrightCli() {
  const failures = [];
  try {
    runCommandQuiet("Verify Playwright-CLI (playwright-cli)", "playwright-cli", ["--version"]);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`playwright-cli --version failed: ${message}`);
  }

  try {
    ensureCommandAvailable("npx");
    runCommandQuiet("Install/verify Playwright-CLI (@latest)", "npx", [
      "-y",
      "@playwright/cli@latest",
      "--version",
    ]);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`npx -y @playwright/cli@latest --version failed: ${message}`);
  }

  console.warn(
    `[bootstrap] WARN: ${failures.join(" ")} ` +
    "Retry manually: playwright-cli --help or npx -y @playwright/cli@latest --help. " +
    "Continuing because Playwright-CLI is only required for improve --assertion-source snapshot-cli."
  );
  return false;
}

function ensureCommandAvailable(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `Required command "${command}" is unavailable in PATH.`
    );
  }
}

function runCommand(label, command, args) {
  console.log(`[bootstrap] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function runCommandQuiet(label, command, args) {
  console.log(`[bootstrap] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

export { parseArgs, resolveInstallArgs, runInstallPlaywrightCli };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
