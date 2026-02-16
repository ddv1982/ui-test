import fs from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import {
  buildPlayFailureReport,
  writePlayFailureReport,
  type PlayFailureArtifactPaths,
} from "../play-failure-report.js";
import type { PlayFailureArtifacts, StepResult } from "./play-types.js";

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
        skipped: stepResult.skipped,
        error: stepResult.error,
        durationMs: stepResult.durationMs,
      })),
      artifacts: {
        tracePath,
        screenshotPath,
      },
      warnings: [...input.artifactWarnings],
    });

    await writePlayFailureReport(report, input.artifactPaths.reportPath);
    reportPath = input.artifactPaths.reportPath;
  } catch (reportErr) {
    const message = reportErr instanceof Error ? reportErr.message : String(reportErr);
    input.artifactWarnings.push(`Failed to write failure report JSON: ${message}`);
  }

  return {
    runId: input.runId,
    testSlug: input.artifactPaths.testSlug,
    reportPath,
    tracePath,
    screenshotPath,
  };
}
