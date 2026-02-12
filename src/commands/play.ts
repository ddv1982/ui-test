import type { Command } from "commander";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { globby } from "globby";
import { play, type TestResult } from "../core/player.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";

const START_TIMEOUT_MS = 60_000;
const START_POLL_MS = 500;

export function registerPlay(program: Command) {
  program
    .command("play")
    .description("Replay one or all YAML tests")
    .argument("[test]", "Path to a specific test file, or omit to run all")
    .option("--headed", "Run browser in headed mode (visible)")
    .option("--timeout <ms>", "Step timeout in milliseconds")
    .option("--delay <ms>", "Delay between steps in milliseconds")
    .option("--no-start", "Do not auto-start app even when startCommand is configured")
    .action(async (testArg, opts) => {
      try {
        await runPlay(testArg, opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runPlay(
  testArg: string | undefined,
  opts: { headed?: boolean; timeout?: string; delay?: string; start?: boolean }
) {
  const config = await loadConfig();
  const headed = opts.headed ?? config.headed ?? false;
  const shouldAutoStart = opts.start !== false;
  const cliTimeout =
    opts.timeout !== undefined
      ? parseTimeout(opts.timeout, "CLI flag --timeout")
      : undefined;
  const timeout = cliTimeout ?? config.timeout ?? 10_000;
  const cliDelay =
    opts.delay !== undefined
      ? parseNonNegativeInt(opts.delay, "CLI flag --delay")
      : undefined;
  const delayMs = cliDelay ?? config.delay ?? 0;

  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
    throw new UserError(
      `Invalid timeout value: ${timeout}`,
      "Timeout must be a positive integer in milliseconds."
    );
  }

  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new UserError(
      `Invalid delay value: ${delayMs}`,
      "Delay must be a non-negative integer in milliseconds."
    );
  }

  let files: string[];

  if (testArg) {
    files = [path.resolve(testArg)];
  } else {
    const testDir = config.testDir ?? "e2e";
    files = await globby(`${testDir}/**/*.{yaml,yml}`);
    if (files.length === 0) {
      throw new UserError(
        `No test files found in ${testDir}/`,
        "Record a test first: npx ui-test record"
      );
    }
    files.sort();
  }

  let appProcess: ChildProcess | undefined;
  try {
    const startCommand = config.startCommand?.trim();
    const baseUrl = config.baseUrl;

    if (shouldAutoStart && startCommand) {
      ui.info(`Starting app: ${startCommand}`);
      appProcess = spawn(startCommand, {
        shell: true,
        stdio: "inherit",
      });

      appProcess.on("error", (err) => {
        ui.error(`Failed to start app process: ${err.message}`);
      });

      if (baseUrl) {
        await waitForReachableBaseUrl(baseUrl, appProcess, START_TIMEOUT_MS);
      } else {
        // If tests only use absolute URLs, there's nothing to probe in advance.
        await sleep(500);
      }
    } else if (baseUrl) {
      const reachable = await isBaseUrlReachable(baseUrl, 2_000);
      if (!reachable) {
        const hint = startCommand
          ? `Cannot reach ${baseUrl}. Run \`${startCommand}\` first, or rerun without --no-start.`
          : `Cannot reach ${baseUrl}. Start your app first, or configure startCommand in ui-test.config.yaml.`;
        throw new UserError(
          `Cannot reach app at ${baseUrl}`,
          hint
        );
      }
    }

    ui.heading(`Running ${files.length} test${files.length > 1 ? "s" : ""}...`);
    console.log();

    const results: TestResult[] = [];

    for (const file of files) {
      ui.info(`Test: ${file}`);
      const result = await play(file, {
        headed,
        timeout,
        baseUrl: config.baseUrl,
        delayMs,
      });
      results.push(result);
      console.log();
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

    console.log();
    ui.heading("Results");
    if (failed === 0) {
      ui.success(`All ${passed} test${passed > 1 ? "s" : ""} passed (${totalMs}ms)`);
    } else {
      ui.error(
        `${failed} failed, ${passed} passed out of ${results.length} test${results.length > 1 ? "s" : ""} (${totalMs}ms)`
      );
      process.exitCode = 1;
    }
  } finally {
    if (appProcess && appProcess.exitCode === null && !appProcess.killed) {
      appProcess.kill("SIGTERM");
      await sleep(250);
    }
  }
}

function parseTimeout(input: string, source: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid timeout value from ${source}: ${input}`,
      "Use a positive integer in milliseconds, for example: --timeout 10000"
    );
  }
  return value;
}

function parseNonNegativeInt(input: string, source: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid delay value from ${source}: ${input}`,
      "Use a non-negative integer in milliseconds, for example: --delay 2000"
    );
  }
  return value;
}

async function waitForReachableBaseUrl(
  baseUrl: string,
  childProcess: ChildProcess,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new UserError(
        "App process exited before becoming reachable.",
        "Check your startCommand and app logs."
      );
    }

    const reachable = await isBaseUrlReachable(baseUrl, 1_500);
    if (reachable) {
      ui.success(`App is reachable at ${baseUrl}`);
      return;
    }

    await sleep(START_POLL_MS);
  }

  throw new UserError(
    `Timed out waiting for app startup after ${timeoutMs}ms`,
    `Ensure your app starts and is reachable at: ${baseUrl}`
  );
}

async function isBaseUrlReachable(baseUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const head = await fetch(baseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Any HTTP response means the server is reachable, even if route status is not 2xx.
    if (head) return true;
  } catch {
    // Fall back to GET for servers that reject HEAD.
  }

  try {
    const get = await fetch(baseUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return Boolean(get);
  } catch {
    return false;
  }
}

export { runPlay, parseTimeout, parseNonNegativeInt, isBaseUrlReachable };
