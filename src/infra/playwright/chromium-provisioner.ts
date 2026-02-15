import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { UserError } from "../../utils/errors.js";

const require = createRequire(import.meta.url);

export function installPlaywrightChromium(): void {
  const playwrightPackageRoot = resolvePlaywrightPackageRoot();
  const playwrightCliEntry = resolvePlaywrightCliEntry(playwrightPackageRoot);
  if (playwrightCliEntry) {
    runInstallStep(
      "Install Playwright Chromium",
      process.execPath,
      buildPlaywrightCliRunArgs(playwrightCliEntry, ["install", "chromium"]),
      playwrightPackageRoot
    );
    return;
  }

  runInstallStep("Install Playwright Chromium", "npx", ["playwright", "install", "chromium"]);
}

export async function verifyChromiumLaunch(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(
      "Playwright Chromium failed to launch after installation.",
      buildLaunchFailureHint(message)
    );
  }
}

export function buildInstallFailureHint(platform: NodeJS.Platform = process.platform): string {
  if (platform === "linux") {
    return (
      "Check internet/proxy settings and retry. Manual command: npx playwright install chromium. " +
      "If launch still fails on Linux, run: npx playwright install-deps chromium"
    );
  }

  return "Check internet/proxy settings and retry. Manual command: npx playwright install chromium";
}

function runInstallStep(
  name: string,
  command: string,
  args: string[],
  cwd?: string
): void {
  console.log(`[setup] ${name}...`);
  const result = spawnSync(command, args, {
    cwd,
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
      buildInstallFailureHint()
    );
  }
}

function resolvePlaywrightCliEntry(playwrightPackageRoot?: string): string | undefined {
  if (!playwrightPackageRoot) return undefined;
  const cliPath = path.join(playwrightPackageRoot, "cli.js");
  return existsSync(cliPath) ? cliPath : undefined;
}

function buildPlaywrightCliRunArgs(playwrightCliEntry: string, args: string[]): string[] {
  const shim = [
    "const cliPath = process.argv[1];",
    "const cliArgs = process.argv.slice(2);",
    "process.argv = [process.execPath, 'playwright', ...cliArgs];",
    "require(cliPath);",
  ].join(" ");
  return ["-e", shim, playwrightCliEntry, ...args];
}

function resolvePlaywrightPackageRoot(): string | undefined {
  try {
    const packageJsonPath = require.resolve("playwright/package.json");
    return path.dirname(packageJsonPath);
  } catch {
    return undefined;
  }
}

function buildLaunchFailureHint(
  message: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "linux" && isLikelyMissingLinuxDeps(message)) {
    return "Linux dependencies may be missing. Run: npx playwright install-deps chromium";
  }

  if (isLikelyMissingLinuxDeps(message)) {
    return (
      "Playwright reported missing system dependencies. " +
      "If you are on Linux, run: npx playwright install-deps chromium"
    );
  }

  return "Retry provisioning with: npx playwright install chromium";
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
