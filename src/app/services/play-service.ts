import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { globby } from "globby";
import { play } from "../../core/play/player-runner.js";
import type { TestResult } from "../../core/play/play-types.js";
import { defaultBrowserLaunchers } from "../../infra/playwright/browser-launcher-adapter.js";
import {
  createPlayRunId,
  writePlayRunReport,
  type PlayRunReport,
} from "../../core/play-failure-report.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../../core/play/play-defaults.js";
import { resolvePlayProfile, type PlayProfileInput } from "../options/play-profile.js";
import { formatPlayProfileSummary } from "../options/profile-summary.js";
import { UserError } from "../../utils/errors.js";
import { ui } from "../../utils/ui.js";
import { buildFailedTestsReport, summarizePlayResults } from "./play-reporting.js";
import { startPlayApp, stopStartedAppProcess } from "./play-startup.js";

export async function runPlay(
  testArg: string | undefined,
  opts: PlayProfileInput
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
      browser: profile.browser,
    })
  );

    let appProcess: ChildProcess | undefined;
    try {
      if (shouldStartApp) {
        ui.info(`Starting app: ${profile.startCommand}`);
        appProcess = await startPlayApp(profile.startCommand, profile.baseUrl);
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
        browser: profile.browser,
      }, {
        browserLaunchers: defaultBrowserLaunchers,
      });
      results.push(result);
      if (result.artifactWarnings) {
        for (const warning of result.artifactWarnings) {
          ui.warn(`Artifact warning (${path.basename(result.file)}): ${warning}`);
        }
      }
      console.log();
    }

    const { passed, failed, totalMs } = summarizePlayResults(results);
    let runReportPath: string | undefined;
    let firstTracePath: string | undefined;

    if (profile.saveFailureArtifacts && failed > 0) {
      const failedReport = buildFailedTestsReport(results);
      const failedTests = failedReport.failedTests;
      if (failedReport.firstTracePath !== undefined) {
        firstTracePath = failedReport.firstTracePath;
      }

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
