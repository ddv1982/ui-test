import fs from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import {
  buildPlayFailureReport,
  type PlayFailureDiagnostics,
  writePlayFailureReport,
  type PlayFailureArtifactPaths,
} from "../play-failure-report.js";
import type { PlayFailureArtifacts, StepResult } from "./play-types.js";

const MAX_FAILURE_DIAGNOSTICS = 20;

export interface TraceCaptureState {
  tracingStarted: boolean;
  tracingStopped: boolean;
}

export async function startTraceCapture(
  context: BrowserContext,
  testName: string,
  artifactWarnings: string[]
): Promise<TraceCaptureState> {
  const traceState: TraceCaptureState = {
    tracingStarted: false,
    tracingStopped: false,
  };

  try {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
      title: testName,
    });
    traceState.tracingStarted = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    artifactWarnings.push(`Failed to start trace capture: ${message}`);
  }

  return traceState;
}

export async function stopTraceCaptureIfNeeded(
  context: BrowserContext,
  traceState: TraceCaptureState,
  artifactWarnings: string[]
): Promise<void> {
  if (!traceState.tracingStarted || traceState.tracingStopped) {
    return;
  }

  try {
    await context.tracing.stop();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    artifactWarnings.push(`Failed to stop trace capture cleanly: ${message}`);
  }
}

export async function captureFailureArtifacts(input: {
  context: BrowserContext;
  page: Page;
  traceState: TraceCaptureState;
  artifactPaths: PlayFailureArtifactPaths;
  runId: string;
  absoluteFilePath: string;
  testName: string;
  step: Step;
  stepIndex: number;
  errorMessage: string;
  stepResult: StepResult;
  stepResults: StepResult[];
  artifactWarnings: string[];
}): Promise<PlayFailureArtifacts | undefined> {
  let canWriteArtifacts = true;
  try {
    await fs.mkdir(input.artifactPaths.testDir, { recursive: true });
  } catch (mkdirErr) {
    const message = mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr);
    input.artifactWarnings.push(`Failed to prepare failure artifact directory: ${message}`);
    canWriteArtifacts = false;
  }

  if (!canWriteArtifacts) {
    return undefined;
  }

  let tracePath: string | undefined;
  let screenshotPath: string | undefined;
  let reportPath: string | undefined;
  const diagnostics = await collectFailureDiagnostics(input.page, input.artifactWarnings);

  if (input.traceState.tracingStarted) {
    try {
      await input.context.tracing.stop({ path: input.artifactPaths.tracePath });
      tracePath = input.artifactPaths.tracePath;
      input.traceState.tracingStopped = true;
    } catch (traceErr) {
      const message = traceErr instanceof Error ? traceErr.message : String(traceErr);
      input.artifactWarnings.push(`Failed to save trace zip: ${message}`);
    }
  }

  try {
    await input.page.screenshot({
      path: input.artifactPaths.screenshotPath,
      fullPage: true,
    });
    screenshotPath = input.artifactPaths.screenshotPath;
  } catch (screenshotErr) {
    const message = screenshotErr instanceof Error ? screenshotErr.message : String(screenshotErr);
    input.artifactWarnings.push(`Failed to save failure screenshot: ${message}`);
  }

  try {
    const reportArtifacts: {
      tracePath?: string;
      screenshotPath?: string;
    } = {};
    if (tracePath !== undefined) {
      reportArtifacts.tracePath = tracePath;
    }
    if (screenshotPath !== undefined) {
      reportArtifacts.screenshotPath = screenshotPath;
    }

    const report = buildPlayFailureReport({
      runId: input.runId,
      testName: input.testName,
      testFile: input.absoluteFilePath,
      testSlug: input.artifactPaths.testSlug,
      failure: {
        stepIndex: input.stepIndex,
        action: input.step.action,
        error: input.errorMessage,
        durationMs: input.stepResult.durationMs,
      },
      steps: input.stepResults.map((stepResult) => ({
        index: stepResult.index,
        action: stepResult.step.action,
        passed: stepResult.passed,
        ...(stepResult.error === undefined ? {} : { error: stepResult.error }),
        durationMs: stepResult.durationMs,
      })),
      artifacts: reportArtifacts,
      ...(diagnostics === undefined ? {} : { diagnostics }),
      warnings: [...input.artifactWarnings],
    });

    await writePlayFailureReport(report, input.artifactPaths.reportPath);
    reportPath = input.artifactPaths.reportPath;
  } catch (reportErr) {
    const message = reportErr instanceof Error ? reportErr.message : String(reportErr);
    input.artifactWarnings.push(`Failed to write failure report JSON: ${message}`);
  }

  const artifacts: PlayFailureArtifacts = {
    runId: input.runId,
    testSlug: input.artifactPaths.testSlug,
  };
  if (reportPath !== undefined) {
    artifacts.reportPath = reportPath;
  }
  if (tracePath !== undefined) {
    artifacts.tracePath = tracePath;
  }
  if (screenshotPath !== undefined) {
    artifacts.screenshotPath = screenshotPath;
  }
  return artifacts;
}

async function collectFailureDiagnostics(
  page: Page,
  artifactWarnings: string[]
): Promise<PlayFailureDiagnostics | undefined> {
  const consoleMessages = await collectConsoleMessages(page, artifactWarnings);
  const pageErrors = await collectPageErrors(page, artifactWarnings);

  if ((consoleMessages?.length ?? 0) === 0 && (pageErrors?.length ?? 0) === 0) {
    return undefined;
  }

  return {
    ...(consoleMessages === undefined ? {} : { consoleMessages }),
    ...(pageErrors === undefined ? {} : { pageErrors }),
  };
}

async function collectConsoleMessages(
  page: Page,
  artifactWarnings: string[]
): Promise<PlayFailureDiagnostics["consoleMessages"]> {
  const consoleMessagesMethod = (page as {
    consoleMessages?: (options?: { filter?: "all" | "since-navigation" }) => Promise<
      Array<{
        type(): string;
        text(): string;
        location(): { url: string; lineNumber: number; columnNumber: number };
      }>
    >;
  }).consoleMessages;

  if (typeof consoleMessagesMethod !== "function") {
    return undefined;
  }

  try {
    const messages = await consoleMessagesMethod.call(page, { filter: "since-navigation" });
    return messages.slice(-MAX_FAILURE_DIAGNOSTICS).map((message) => {
      const location = message.location();
      return {
        type: message.type(),
        text: message.text(),
        ...((location.url || location.lineNumber > 0 || location.columnNumber > 0)
          ? { location }
          : {}),
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    artifactWarnings.push(`Failed to collect page console messages: ${message}`);
    return undefined;
  }
}

async function collectPageErrors(
  page: Page,
  artifactWarnings: string[]
): Promise<PlayFailureDiagnostics["pageErrors"]> {
  const pageErrorsMethod = (page as {
    pageErrors?: (options?: { filter?: "all" | "since-navigation" }) => Promise<Error[]>;
  }).pageErrors;

  if (typeof pageErrorsMethod !== "function") {
    return undefined;
  }

  try {
    const pageErrors = await pageErrorsMethod.call(page, { filter: "since-navigation" });
    return pageErrors.slice(-MAX_FAILURE_DIAGNOSTICS).map((error) => ({
      message: error.message || String(error),
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    artifactWarnings.push(`Failed to collect page errors: ${message}`);
    return undefined;
  }
}
