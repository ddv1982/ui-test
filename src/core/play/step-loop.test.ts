import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { runPlayStepLoop } from "./step-loop.js";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn(async () => {}),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn(async () => false),
}));
const { warnMock, successMock, errorMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
}));

vi.mock("../../utils/ui.js", () => ({
  ui: {
    warn: warnMock,
    success: successMock,
    error: errorMock,
  },
}));

function makeClickStep(index: number): Step {
  return {
    action: "click",
    target: {
      value: `#button-${index}`,
      kind: "css",
      source: "manual",
    },
  };
}

function makeOptionalClickStep(index: number): Step {
  return {
    action: "click",
    target: {
      value: `#button-${index}`,
      kind: "css",
      source: "manual",
    },
    optional: true,
  };
}

describe("runPlayStepLoop optional step behavior", () => {
  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    waitForPostStepNetworkIdleMock.mockClear();
    warnMock.mockClear();
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("skips optional step on failure and continues", async () => {
    executeRuntimeStepMock
      .mockResolvedValueOnce(undefined) // step 1 passes
      .mockRejectedValueOnce(new Error("Element not found")) // step 2 (optional) fails
      .mockResolvedValueOnce(undefined); // step 3 passes

    const steps: Step[] = [
      makeClickStep(1),
      makeOptionalClickStep(2),
      makeClickStep(3),
    ];

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps,
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-opt-1",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Optional Skip Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults[0].passed).toBe(true);
    expect(result.stepResults[0].skipped).toBeUndefined();
    expect(result.stepResults[1].passed).toBe(true);
    expect(result.stepResults[1].skipped).toBe(true);
    expect(result.stepResults[2].passed).toBe(true);
    expect(result.stepResults[2].skipped).toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("skipped (optional)"));
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("records optional step as passed when element is found", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const steps: Step[] = [makeOptionalClickStep(1)];

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps,
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-opt-2",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Optional Pass Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].passed).toBe(true);
    expect(result.stepResults[0].skipped).toBeUndefined();
  });

  it("still fails on non-optional step failure", async () => {
    executeRuntimeStepMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Element not found"));

    const steps: Step[] = [makeClickStep(1), makeClickStep(2)];

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps,
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-opt-3",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Non-Optional Fail Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0].passed).toBe(true);
    expect(result.stepResults[1].passed).toBe(false);
    expect(result.stepResults[1].error).toBe("Element not found");
    expect(errorMock).toHaveBeenCalled();
  });
});

describe("runPlayStepLoop warning behavior", () => {
  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    waitForPostStepNetworkIdleMock.mockClear();
    warnMock.mockClear();
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("suppresses repeated network idle wait warnings after the limit", async () => {
    waitForPostStepNetworkIdleMock.mockResolvedValue(true);
    const steps = Array.from({ length: 6 }, (_, index) => makeClickStep(index + 1));

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps,
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: true,
      runId: "run-1",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Suppression Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(6);
    expect(result.stepResults.every((stepResult) => stepResult.passed)).toBe(true);
    expect(warnMock).toHaveBeenCalledTimes(4);
    expect(warnMock.mock.calls[0]?.[0]).toContain("network idle wait timed out; continuing.");
    expect(warnMock.mock.calls[3]?.[0]).toBe(
      "Additional network idle wait warnings will be suppressed for this test file."
    );
  });

  it("does not warn when post-step network idle waits do not time out", async () => {
    waitForPostStepNetworkIdleMock.mockResolvedValue(false);
    const steps = [makeClickStep(1), makeClickStep(2)];

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps,
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: true,
      runId: "run-2",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "No Warning Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults.every((stepResult) => stepResult.passed)).toBe(true);
    expect(warnMock).not.toHaveBeenCalled();
  });
});
