import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { globby } from "globby";
import { play, type TestResult } from "../../core/player.js";
import {
  createPlayRunId,
  writePlayRunReport,
  type PlayRunReport,
} from "../../core/play-failure-report.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../../core/play/play-defaults.js";
import { resolvePlayProfile } from "../options/play-profile.js";
import { formatPlayProfileSummary } from "../options/profile-summary.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";

const START_TIMEOUT_MS = 60_000;
const START_POLL_MS = 500;

export interface PlayCliOptions {
  headed?: boolean;
  timeout?: string;
  delay?: string;
  waitNetworkIdle?: boolean;
  saveFailureArtifacts?: boolean;
  artifactsDir?: string;
  start?: boolean;
}

export async function runPlay(
  testArg: string | undefined,
  opts: PlayCliOptions
): Promise<void> {
  const profile = resolvePlayProfile(opts);
  const runId = createPlayRunId();

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
  }
  files = files.map((file) => path.resolve(file)).sort();

  const exampleTestFilePath = path.resolve(PLAY_DEFAULT_EXAMPLE_TEST_FILE);
  const isExampleOnlyRun = files.length === 1 && files[0] === exampleTestFilePath;
  const shouldStartApp = profile.shouldAutoStart && isExampleOnlyRun;

  ui.info(
    formatPlayProfileSummary({
      headed: profile.headed,
      timeout: profile.timeout,
      delayMs: profile.delayMs,
      waitForNetworkIdle: profile.waitForNetworkIdle,
      autoStart: shouldStartApp,
      saveFailureArtifacts: profile.saveFailureArtifacts,
      artifactsDir: profile.artifactsDir,
    })
  );

  let appProcess: ChildProcess | undefined;
  try {
    if (shouldStartApp) {
      ui.info(`Starting app: ${profile.startCommand}`);
      appProcess = spawn(profile.startCommand, {
        shell: true,
        stdio: "inherit",
        detached: process.platform !== "win32",
      });

      appProcess.on("error", (err) => {
        ui.error(`Failed to start app process: ${err.message}`);
      });

      await waitForReachableBaseUrl(profile.baseUrl, appProcess, START_TIMEOUT_MS);
    } else if (profile.shouldAutoStart) {
      ui.info(
        `Auto-start skipped: built-in example app starts only for ${PLAY_DEFAULT_EXAMPLE_TEST_FILE}.`
      );
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
    if (appProcess) {
      await stopStartedAppProcess(appProcess);
    }
  }
}

async function stopStartedAppProcess(appProcess: ChildProcess): Promise<void> {
  let onExit: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    onExit = () => resolve();
    appProcess.once("exit", onExit);
  });

  if (appProcess.exitCode !== null || appProcess.killed) {
    appProcess.removeListener("exit", onExit!);
    return;
  }

  // On Unix, kill the spawned process group to avoid orphaning the real app process
  // behind the shell wrapper used for fallback command chaining.
  if (
    process.platform !== "win32" &&
    typeof appProcess.pid === "number" &&
    tryKillProcessGroup(appProcess.pid, "SIGTERM")
  ) {
    // wait for exit, fall back to SIGKILL after 2s
  } else {
    appProcess.kill("SIGTERM");
  }

  const ac1 = new AbortController();
  const exited = await Promise.race([
    exitPromise.then(() => { ac1.abort(); return true; }),
    sleep(2000, undefined, { signal: ac1.signal }).then(() => false).catch(() => false),
  ]);

  if (!exited) {
    ui.dim("App process did not exit after SIGTERM, sending SIGKILL...");
    if (
      process.platform !== "win32" &&
      typeof appProcess.pid === "number"
    ) {
      tryKillProcessGroup(appProcess.pid, "SIGKILL");
    } else {
      appProcess.kill("SIGKILL");
    }
    const ac2 = new AbortController();
    await Promise.race([
      exitPromise.then(() => ac2.abort()),
      sleep(1000, undefined, { signal: ac2.signal }).catch(() => {}),
    ]);
  }
}

function tryKillProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
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

    if (await isBaseUrlReachable(baseUrl, START_POLL_MS)) {
      ui.success(`App is reachable at ${baseUrl}`);
      return;
    }

    await sleep(START_POLL_MS);
  }

  throw new UserError(
    `Timed out waiting for app to become reachable at ${baseUrl}`,
    "Check start command output, or run ui-test play --no-start."
  );
}

async function isBaseUrlReachable(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      signal: abortController.signal,
    });
    return response.ok || response.status >= 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
