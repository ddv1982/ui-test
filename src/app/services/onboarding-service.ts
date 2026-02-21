import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "../../utils/errors.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../../core/play/play-defaults.js";
import {
  installPlaywrightBrowsers,
  verifyBrowserLaunch,
  type PlaywrightBrowser,
} from "../../infra/playwright/browser-provisioner.js";

export interface OnboardingPlan {
  browsers: PlaywrightBrowser[];
  runPlay: boolean;
}

export interface OnboardingContext {
  uiTestCliEntry: string;
}

export async function runOnboardingPlan(
  plan: OnboardingPlan,
  context: OnboardingContext
): Promise<void> {
  const primaryBrowser = plan.browsers[0];
  if (!primaryBrowser) {
    throw new UserError("No browsers selected for setup.");
  }

  installPlaywrightBrowsers(plan.browsers);
  await verifyBrowserLaunch(primaryBrowser);

  if (plan.runPlay) {
    const exampleTestPath = path.resolve(PLAY_DEFAULT_EXAMPLE_TEST_FILE);
    if (existsSync(exampleTestPath)) {
      runUiTestCommand(context.uiTestCliEntry, "play", [PLAY_DEFAULT_EXAMPLE_TEST_FILE]);
    } else {
      console.warn(
        `[setup] WARN: Skipping run-play because ${PLAY_DEFAULT_EXAMPLE_TEST_FILE} was not found in ${process.cwd()}. ` +
        "Record a test first with: ui-test record"
      );
    }
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

function runCommand(label: string, command: string, args: string[], options?: { quiet?: boolean }) {
  console.log(`[setup] ${label}`);
  const result = spawnSync(command, args, {
    stdio: options?.quiet ? "ignore" : "inherit",
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

// Re-export browser types for commands layer (commands cannot import from infra directly)
export { ALL_PLAYWRIGHT_BROWSERS, validateBrowserName, type PlaywrightBrowser } from "../../infra/playwright/browser-provisioner.js";
