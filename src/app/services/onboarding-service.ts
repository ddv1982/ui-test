import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "../../utils/errors.js";
import {
  installPlaywrightChromium,
  verifyChromiumLaunch,
} from "../../infra/playwright/chromium-provisioner.js";

export type SetupMode = "install" | "quickstart";

export interface OnboardingPlan {
  mode: SetupMode;
  runPlay: boolean;
}

export interface OnboardingContext {
  uiTestCliEntry: string;
}

export async function runOnboardingPlan(
  plan: OnboardingPlan,
  context: OnboardingContext
): Promise<void> {
  if (plan.mode === "install") {
    runInstallDependencies();
    runInstallPlaywrightCli();
    return;
  }

  runInstallDependencies();
  runInstallPlaywrightCli();
  installPlaywrightChromium();
  await verifyChromiumLaunch();
  if (plan.runPlay) {
    runUiTestCommand(context.uiTestCliEntry, "play", []);
  }
}

function runUiTestCommand(uiTestCliEntry: string, command: string, args: string[]) {
  const fullArgs = [uiTestCliEntry, command, ...args];
  runCommand(
    `Run ui-test ${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
    process.execPath,
    fullArgs
  );
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

function runInstallPlaywrightCli() {
  const failures: string[] = [];
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
    `[setup] WARN: ${failures.join(" ")} ` +
    "Retry manually: playwright-cli --help or npx -y @playwright/cli@latest --help. " +
    "Continuing because Playwright-CLI is only required for improve --assertion-source snapshot-cli."
  );
  return false;
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
  console.log(`[setup] ${label}`);
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

function runCommandQuiet(label: string, command: string, args: string[]) {
  console.log(`[setup] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "ignore",
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
  resolveInstallArgs,
  runInstallPlaywrightCli,
};
