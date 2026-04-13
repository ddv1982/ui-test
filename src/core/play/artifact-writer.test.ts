import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlayFailureArtifactPaths } from "../play-failure-report.js";
import type { Step } from "../yaml-schema.js";
import { captureFailureArtifacts } from "./artifact-writer.js";
import type { StepResult } from "./play-types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTestContext() {
  const rootDir = await mkdtemp(join(tmpdir(), "ui-test-artifact-writer-"));
  tempDirs.push(rootDir);

  const step: Step = {
    action: "click",
    target: {
      value: "#missing",
      kind: "css",
      source: "manual",
    },
  };
  const stepResult: StepResult = {
    step,
    index: 0,
    passed: false,
    error: "Element not found",
    durationMs: 123,
  };

  return {
    rootDir,
    artifactWarnings: [] as string[],
    artifactPaths: buildPlayFailureArtifactPaths({
      artifactsDir: join(rootDir, "artifacts"),
      runId: "run-1",
      testFilePath: join(rootDir, "test.yaml"),
    }),
    context: {
      tracing: {
        stop: vi.fn(async () => {}),
      },
    } as unknown as BrowserContext,
    step,
    stepResult,
  };
}

describe("captureFailureArtifacts diagnostics", () => {
  it("includes console messages and page errors in the failure report", async () => {
    const testContext = await createTestContext();
    const page = {
      screenshot: vi.fn(async () => {}),
      consoleMessages: vi.fn(async () => [
        {
          type: () => "error",
          text: () => "console exploded",
          location: () => ({
            url: "http://example.test/app.js",
            lineNumber: 4,
            columnNumber: 2,
          }),
        },
      ]),
      pageErrors: vi.fn(async () => {
        const error = new Error("page exploded");
        error.stack = "Error: page exploded\n    at app.js:5:1";
        return [error];
      }),
    } as unknown as Page;

    const artifacts = await captureFailureArtifacts({
      context: testContext.context,
      page,
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactPaths: testContext.artifactPaths,
      runId: "run-1",
      absoluteFilePath: join(testContext.rootDir, "test.yaml"),
      testName: "Failure Diagnostics",
      step: testContext.step,
      stepIndex: 0,
      errorMessage: "Element not found",
      stepResult: testContext.stepResult,
      stepResults: [testContext.stepResult],
      artifactWarnings: testContext.artifactWarnings,
    });

    const report = JSON.parse(await readFile(artifacts?.reportPath ?? "", "utf-8")) as {
      diagnostics?: {
        consoleMessages?: Array<{
          type: string;
          text: string;
          location?: { url: string; lineNumber: number; columnNumber: number };
        }>;
        pageErrors?: Array<{ message: string; stack?: string }>;
      };
    };

    expect(report.diagnostics?.consoleMessages).toEqual([
      {
        type: "error",
        text: "console exploded",
        location: {
          url: "http://example.test/app.js",
          lineNumber: 4,
          columnNumber: 2,
        },
      },
    ]);
    expect(report.diagnostics?.pageErrors).toEqual([
      {
        message: "page exploded",
        stack: "Error: page exploded\n    at app.js:5:1",
      },
    ]);
  });

  it("keeps artifact capture working when diagnostics APIs are unavailable", async () => {
    const testContext = await createTestContext();
    const page = {
      screenshot: vi.fn(async () => {}),
    } as unknown as Page;

    const artifacts = await captureFailureArtifacts({
      context: testContext.context,
      page,
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactPaths: testContext.artifactPaths,
      runId: "run-1",
      absoluteFilePath: join(testContext.rootDir, "test.yaml"),
      testName: "Failure Diagnostics Unsupported",
      step: testContext.step,
      stepIndex: 0,
      errorMessage: "Element not found",
      stepResult: testContext.stepResult,
      stepResults: [testContext.stepResult],
      artifactWarnings: testContext.artifactWarnings,
    });

    const report = JSON.parse(await readFile(artifacts?.reportPath ?? "", "utf-8")) as {
      diagnostics?: unknown;
    };

    expect(artifacts?.reportPath).toBeDefined();
    expect(report.diagnostics).toBeUndefined();
    expect(testContext.artifactWarnings).toEqual([]);
  });

  it("warns and still writes the report when diagnostics retrieval fails", async () => {
    const testContext = await createTestContext();
    const page = {
      screenshot: vi.fn(async () => {}),
      consoleMessages: vi.fn(async () => {
        throw new Error("not supported by this runtime");
      }),
    } as unknown as Page;

    const artifacts = await captureFailureArtifacts({
      context: testContext.context,
      page,
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactPaths: testContext.artifactPaths,
      runId: "run-1",
      absoluteFilePath: join(testContext.rootDir, "test.yaml"),
      testName: "Failure Diagnostics Warning",
      step: testContext.step,
      stepIndex: 0,
      errorMessage: "Element not found",
      stepResult: testContext.stepResult,
      stepResults: [testContext.stepResult],
      artifactWarnings: testContext.artifactWarnings,
    });

    const report = JSON.parse(await readFile(artifacts?.reportPath ?? "", "utf-8")) as {
      diagnostics?: unknown;
      warnings: string[];
    };

    expect(artifacts?.reportPath).toBeDefined();
    expect(report.diagnostics).toBeUndefined();
    expect(report.warnings).toContain(
      "Failed to collect page console messages: not supported by this runtime"
    );
  });
});
