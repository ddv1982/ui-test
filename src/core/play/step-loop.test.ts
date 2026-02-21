import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserContext, Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { runPlayStepLoop } from "./step-loop.js";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn<
    typeof import("../runtime/step-executor.js").executeRuntimeStep
  >(async () => {}),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn<
    typeof import("../runtime/network-idle.js").waitForPostStepNetworkIdle
  >(async () => false),
}));
const {
  dismissCookieBannerWithDetailsMock,
  isLikelyOverlayInterceptionErrorMock,
} = vi.hoisted(() => ({
  dismissCookieBannerWithDetailsMock: vi.fn<
    typeof import("../runtime/cookie-banner.js").dismissCookieBannerWithDetails
  >(async () => ({ dismissed: false })),
  isLikelyOverlayInterceptionErrorMock: vi.fn<
    typeof import("../runtime/cookie-banner.js").isLikelyOverlayInterceptionError
  >(() => false),
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

vi.mock("../runtime/cookie-banner.js", () => ({
  dismissCookieBannerWithDetails: dismissCookieBannerWithDetailsMock,
  isLikelyOverlayInterceptionError: isLikelyOverlayInterceptionErrorMock,
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

describe("runPlayStepLoop per-step timeout", () => {
  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    waitForPostStepNetworkIdleMock.mockClear();
    dismissCookieBannerWithDetailsMock.mockClear();
    isLikelyOverlayInterceptionErrorMock.mockClear();
    dismissCookieBannerWithDetailsMock.mockResolvedValue({ dismissed: false });
    isLikelyOverlayInterceptionErrorMock.mockReturnValue(false);
    warnMock.mockClear();
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("passes step with timeout field to executeRuntimeStep", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const step: Step = {
      action: "click",
      target: {
        value: "#cookie-accept",
        kind: "css",
        source: "manual",
      },
      timeout: 2000,
    };

    await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [step],
      timeout: 10_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-timeout-1",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Per-Step Timeout Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(executeRuntimeStepMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 2000 }),
      expect.objectContaining({ timeout: 10_000 })
    );
  });
});

describe("runPlayStepLoop warning behavior", () => {
  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    waitForPostStepNetworkIdleMock.mockClear();
    dismissCookieBannerWithDetailsMock.mockClear();
    isLikelyOverlayInterceptionErrorMock.mockClear();
    dismissCookieBannerWithDetailsMock.mockResolvedValue({ dismissed: false });
    isLikelyOverlayInterceptionErrorMock.mockReturnValue(false);
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

  it("retries once when click fails due overlay interception", async () => {
    executeRuntimeStepMock
      .mockRejectedValueOnce(new Error("subtree intercepts pointer events"))
      .mockResolvedValueOnce(undefined);
    isLikelyOverlayInterceptionErrorMock.mockReturnValue(true);
    dismissCookieBannerWithDetailsMock
      .mockResolvedValueOnce({ dismissed: false })
      .mockResolvedValueOnce({ dismissed: true, strategy: "text_match" })
      .mockResolvedValueOnce({ dismissed: false });

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [makeClickStep(1)],
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-retry",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Retry Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.passed).toBe(true);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);
    expect(warnMock).toHaveBeenCalledWith(
      "Step 1 (click): retrying after consent overlay dismissal."
    );
  });

  it("retries once after non-cookie overlay dismissal", async () => {
    executeRuntimeStepMock
      .mockRejectedValueOnce(new Error("another element would receive the click"))
      .mockResolvedValueOnce(undefined);
    isLikelyOverlayInterceptionErrorMock.mockReturnValue(true);
    dismissCookieBannerWithDetailsMock
      .mockResolvedValueOnce({ dismissed: false })
      .mockResolvedValueOnce({
        dismissed: true,
        strategy: "modal_close_control",
        category: "non_cookie_overlay",
      })
      .mockResolvedValueOnce({ dismissed: false });
    const artifactWarnings: string[] = [];

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [makeClickStep(1)],
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-retry-non-cookie",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Retry Non-Cookie Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings,
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.passed).toBe(true);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);
    expect(warnMock).toHaveBeenCalledWith("Step 1 (click): retrying after overlay dismissal.");
    expect(
      artifactWarnings.some((warning) => warning.includes("retried after overlay dismissal"))
    ).toBe(true);
  });

  it("records cookie dismissal events in artifact warnings", async () => {
    const artifactWarnings: string[] = [];
    dismissCookieBannerWithDetailsMock.mockResolvedValue({
      dismissed: true,
      strategy: "known_selector",
      frameUrl: "https://consent.example.com",
    });

    await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [makeClickStep(1)],
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-observable",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Observability Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings,
    });

    expect(artifactWarnings.some((warning) => warning.includes("dismissed cookie banner"))).toBe(
      true
    );
  });

  it("continues when pre-step dismiss check throws", async () => {
    dismissCookieBannerWithDetailsMock.mockRejectedValueOnce(new Error("dismiss probe failed"));
    executeRuntimeStepMock.mockResolvedValueOnce(undefined);

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [makeClickStep(1)],
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-dismiss-throw",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Dismiss Throw Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.passed).toBe(true);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly when overlay retry dismiss check throws", async () => {
    executeRuntimeStepMock.mockRejectedValueOnce(
      new Error("another element would receive the click")
    );
    isLikelyOverlayInterceptionErrorMock.mockReturnValue(true);
    dismissCookieBannerWithDetailsMock
      .mockResolvedValueOnce({ dismissed: false })
      .mockRejectedValueOnce(new Error("retry dismiss failed"));

    const result = await runPlayStepLoop({
      page: {} as Page,
      context: {} as BrowserContext,
      steps: [makeClickStep(1)],
      timeout: 1_000,
      delayMs: 0,
      waitForNetworkIdle: false,
      runId: "run-retry-dismiss-throw",
      absoluteFilePath: "/tmp/test.yaml",
      testName: "Retry Dismiss Throw Test",
      traceState: { tracingStarted: false, tracingStopped: false },
      artifactWarnings: [],
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.passed).toBe(false);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(1);
  });
});
