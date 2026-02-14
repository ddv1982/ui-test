import type { Command } from "commander";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { globby } from "globby";
import { play, type TestResult } from "../core/player.js";
import {
  createPlayRunId,
  writePlayRunReport,
  type PlayRunReport,
} from "../core/play-failure-report.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError, UserError } from "../utils/errors.js";
import { resolvePlayProfile } from "../app/options/play-profile.js";
import { formatPlayProfileSummary } from "../app/options/profile-summary.js";

const START_TIMEOUT_MS = 60_000;
const START_POLL_MS = 500;

interface PlayCliOptions {
  headed?: boolean;
  timeout?: string;
  delay?: string;
  waitNetworkIdle?: boolean;
  networkIdleTimeout?: string;
  saveFailureArtifacts?: boolean;
  artifactsDir?: string;
  start?: boolean;
}

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
    .option("--network-idle-timeout <ms>", "Timeout for post-step network idle wait in milliseconds")
    .option("--save-failure-artifacts", "Save JSON/trace/screenshot artifacts on test failure")
    .option("--no-save-failure-artifacts", "Disable failure artifact capture")
    .option("--artifacts-dir <path>", "Directory for play failure artifacts")
    .option("--no-start", "Do not auto-start app even when startCommand is configured")
    .action(async (testArg: unknown, opts: unknown) => {
      try {
        await runPlay(parseOptionalArgument(testArg), parsePlayCliOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runPlay(
  testArg: string | undefined,
  opts: PlayCliOptions
) {
  const config = await loadConfig();
  const profile = resolvePlayProfile(opts, config);
  const runId = createPlayRunId();

  ui.info(
    formatPlayProfileSummary({
      headed: profile.headed,
      timeout: profile.timeout,
      delayMs: profile.delayMs,
      waitForNetworkIdle: profile.waitForNetworkIdle,
      networkIdleTimeout: profile.networkIdleTimeout,
      autoStart: profile.shouldAutoStart,
      saveFailureArtifacts: profile.saveFailureArtifacts,
      artifactsDir: profile.artifactsDir,
    })
  );

  let files: string[];

  if (testArg) {
    files = [path.resolve(testArg)];
  } else {
    files = await globby(`${profile.testDir}/**/*.{yaml,yml}`);
    if (files.length === 0) {
      throw new UserError(
        `No test files found in ${profile.testDir}/`,
        "Record a test first: ui-test record"
      );
    }
    files.sort();
  }

  let appProcess: ChildProcess | undefined;
  try {
    if (profile.shouldAutoStart && profile.startCommand) {
      ui.info(`Starting app: ${profile.startCommand}`);
      appProcess = spawn(profile.startCommand, {
        shell: true,
        stdio: "inherit",
      });

      appProcess.on("error", (err) => {
        ui.error(`Failed to start app process: ${err.message}`);
      });

      if (profile.baseUrl) {
        await waitForReachableBaseUrl(profile.baseUrl, appProcess, START_TIMEOUT_MS);
      } else {
        await sleep(500);
      }
    } else if (profile.baseUrl) {
      const reachable = await isBaseUrlReachable(profile.baseUrl, 2_000);
      if (!reachable) {
        const hint = profile.startCommand
          ? `Cannot reach ${profile.baseUrl}. Run \`${profile.startCommand}\` first, or rerun without --no-start.`
          : `Cannot reach ${profile.baseUrl}. Start your app first, or configure startCommand in ui-test.config.yaml.`;
        throw new UserError(`Cannot reach app at ${profile.baseUrl}`, hint);
      }
    }

    ui.heading(`Running ${files.length} test${files.length > 1 ? "s" : ""}...`);
    console.log();

    const results: TestResult[] = [];

    for (const file of files) {
      ui.info(`Test: ${file}`);
      const result = await play(file, {
        headed: profile.headed,
        timeout: profile.timeout,
        baseUrl: profile.baseUrl,
        delayMs: profile.delayMs,
        waitForNetworkIdle: profile.waitForNetworkIdle,
        networkIdleTimeout: profile.networkIdleTimeout,
        saveFailureArtifacts: profile.saveFailureArtifacts,
        artifactsDir: profile.artifactsDir,
        runId,
      });
      results.push(result);
      if (result.artifactWarnings) {
        for (const warning of result.artifactWarnings) {
          ui.warn(`Artifact warning (${path.basename(result.file)}): ${warning}`);
        }
      }
      console.log();
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    let runReportPath: string | undefined;
    let firstTracePath: string | undefined;

    if (profile.saveFailureArtifacts && failed > 0) {
      const failedTests = results
        .filter((result) => !result.passed)
        .map((result) => {
          const failedStep = result.steps.find((step) => !step.passed);
          if (!firstTracePath && result.failureArtifacts?.tracePath) {
            firstTracePath = result.failureArtifacts.tracePath;
          }
          return {
            name: result.name,
            file: result.file,
            slug: result.failureArtifacts?.testSlug ?? "unknown",
            failure: {
              stepIndex: failedStep?.index ?? 0,
              action: failedStep?.step.action ?? "unknown",
              error: failedStep?.error ?? "Unknown failure",
            },
            artifacts: {
              reportPath: result.failureArtifacts?.reportPath,
              tracePath: result.failureArtifacts?.tracePath,
              screenshotPath: result.failureArtifacts?.screenshotPath,
            },
            warnings: result.artifactWarnings ?? [],
          };
        });

      const runReport: PlayRunReport = {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        runId,
        summary: {
          total: results.length,
          passed,
          failed,
          durationMs: totalMs,
        },
        failedTests,
      };

      try {
        runReportPath = await writePlayRunReport(runReport, {
          artifactsDir: profile.artifactsDir,
          runId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ui.warn(`Failed to write run artifact index: ${message}`);
      }
    }

    console.log();
    ui.heading("Results");
    if (failed === 0) {
      ui.success(`All ${passed} test${passed > 1 ? "s" : ""} passed (${totalMs}ms)`);
    } else {
      ui.error(
        `${failed} failed, ${passed} passed out of ${results.length} test${results.length > 1 ? "s" : ""} (${totalMs}ms)`
      );
      if (runReportPath) {
        ui.step(`Failure artifacts index: ${runReportPath}`);
      }
      if (firstTracePath) {
        ui.step(`Open trace: npx playwright show-trace ${firstTracePath}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (appProcess && appProcess.exitCode === null && !appProcess.killed) {
      appProcess.kill("SIGTERM");
      await sleep(250);
    }
  }
}

function parsePlayCliOptions(value: unknown): PlayCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    headed: asOptionalBoolean(record.headed),
    timeout: asOptionalString(record.timeout),
    delay: asOptionalString(record.delay),
    waitNetworkIdle: asOptionalBoolean(record.waitNetworkIdle),
    networkIdleTimeout: asOptionalString(record.networkIdleTimeout),
    saveFailureArtifacts: asOptionalBoolean(record.saveFailureArtifacts),
    artifactsDir: asOptionalString(record.artifactsDir),
    start: asOptionalBoolean(record.start),
  };
}

function parseOptionalArgument(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

export { runPlay, isBaseUrlReachable };
