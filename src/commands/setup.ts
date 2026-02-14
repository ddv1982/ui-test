import type { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { findLegacyConfigPath, loadConfig } from "../utils/config.js";
import { handleError, UserError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";
import { runInit } from "./init.js";

const CONFIG_FILENAMES = ["ui-test.config.yaml"];

interface SetupOptions {
  forceInit?: boolean;
  skipBrowserInstall?: boolean;
}

export function registerSetup(program: Command) {
  program
    .command("setup")
    .description("Prepare project for first run (config + browsers)")
    .option("--skip-browser-install", "Skip Playwright browser installation")
    .option("--force-init", "Reinitialize config and sample test with defaults")
    .action(async (opts: unknown) => {
      try {
        await runSetup(parseSetupOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runSetup(opts: SetupOptions = {}): Promise<void> {
  ui.heading("ui-test setup");
  console.log();

  const existingConfigPath = await findExistingConfigPath();
  if (opts.forceInit || !existingConfigPath) {
    if (!opts.forceInit) {
      const legacyConfigPath = await findLegacyConfigPath();
      if (legacyConfigPath) {
        throw new UserError(
          `Legacy config file detected at ${legacyConfigPath}`,
          "Rename it to ui-test.config.yaml, then rerun setup. If you want a fresh config instead, use: npx ui-test setup --force-init"
        );
      }
    }

    if (opts.forceInit && existingConfigPath) {
      ui.info(`Config found at ${existingConfigPath}; reinitializing due to --force-init.`);
    } else {
      ui.info("No config found; initializing with defaults.");
    }
    await runInit({ yes: true, ...(opts.forceInit ? { overwriteSample: true } : {}) });
  } else {
    ui.info(`Existing config detected at ${existingConfigPath}; keeping as-is.`);
    await loadConfig();
  }

  if (opts.skipBrowserInstall) {
    ui.warn("Skipping Playwright browser installation (--skip-browser-install).");
  } else {
    runInstallStep("Install Playwright Chromium", "npx", ["playwright", "install", "chromium"]);
    await verifyChromiumLaunch();
  }

  console.log();
  ui.success("Setup complete.");
  ui.step("Run tests: npx ui-test play");
}

async function findExistingConfigPath(): Promise<string | undefined> {
  for (const file of CONFIG_FILENAMES) {
    const configPath = path.resolve(file);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // Keep checking.
    }
  }
  return undefined;
}

function runInstallStep(name: string, command: string, args: string[]): void {
  ui.info(`${name}...`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new UserError(
      `${name} failed: ${result.error.message}`,
      "Ensure Node.js/npm are installed and available in your PATH."
    );
  }

  if (result.status !== 0) {
    throw new UserError(
      `${name} failed.`,
      "Check internet/proxy settings and retry. Manual command: npx playwright install chromium"
    );
  }
}

async function verifyChromiumLaunch(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    ui.success("Chromium launch check passed.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(
      "Playwright Chromium failed to launch after installation.",
      buildLaunchFailureHint(message)
    );
  }
}

function buildLaunchFailureHint(message: string): string {
  if (isLikelyMissingLinuxDeps(message)) {
    return "Linux dependencies may be missing. Run: npx playwright install-deps chromium";
  }

  return "Re-run setup, then try: npx playwright install chromium";
}

function isLikelyMissingLinuxDeps(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("host system is missing dependencies") ||
    normalized.includes("install-deps") ||
    normalized.includes("error while loading shared libraries") ||
    normalized.includes("libgtk") ||
    normalized.includes("libx11") ||
    normalized.includes("libnss3")
  );
}

export { runSetup, buildLaunchFailureHint, isLikelyMissingLinuxDeps, findExistingConfigPath };

function parseSetupOptions(value: unknown): SetupOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    forceInit: asOptionalBoolean(record.forceInit),
    skipBrowserInstall: asOptionalBoolean(record.skipBrowserInstall),
  };
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
