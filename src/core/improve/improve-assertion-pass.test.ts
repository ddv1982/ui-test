import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import { runImproveAssertionPass } from "./improve-assertion-pass.js";

const { buildAssertionCandidatesMock } = vi.hoisted(() => ({
  buildAssertionCandidatesMock: vi.fn(() => []),
}));
const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn(async () => {}),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn(async () => false),
}));

vi.mock("./assertion-candidates.js", () => ({
  buildAssertionCandidates: buildAssertionCandidatesMock,
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  DEFAULT_WAIT_FOR_NETWORK_IDLE: true,
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
}));

function baseCandidates(): AssertionCandidate[] {
  return [
    {
      index: 1,
      afterAction: "click",
      candidate: {
        action: "assertVisible",
        target: { value: "#submit", kind: "css", source: "manual" },
      },
      confidence: 0.76,
      rationale:
        "Coverage fallback: verify interacted element remains visible after action.",
      candidateSource: "deterministic",
      coverageFallback: true,
    },
    {
      index: 1,
      afterAction: "click",
      candidate: {
        action: "assertText",
        target: { value: "#status", kind: "css", source: "manual" },
        text: "Saved",
      },
      confidence: 0.91,
      rationale: "High-signal post-click text assertion.",
      candidateSource: "deterministic",
    },
  ];
}

describe("runImproveAssertionPass coverage fallback behavior", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    executeRuntimeStepMock.mockResolvedValue(undefined);
    waitForPostStepNetworkIdleMock.mockResolvedValue(false);
  });

  it("forces fallback to skipped_policy when stronger candidate exists for the same step", async () => {
    buildAssertionCandidatesMock.mockReturnValue(baseCandidates());

    const diagnostics: import("./report-schema.js").ImproveDiagnostic[] = [];
    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "balanced",
      applyAssertions: true,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [],
      diagnostics,
    });

    expect(result.appliedAssertions).toBe(1);
    expect(result.skippedAssertions).toBe(1);
    expect(
      result.assertionCandidates.find((candidate) => candidate.coverageFallback === true)
    ).toMatchObject({
      applyStatus: "skipped_policy",
    });
    expect(
      result.assertionCandidates.find((candidate) => candidate.coverageFallback === true)
        ?.applyMessage
    ).toContain("coverage fallback suppressed because stronger candidate exists");
    expect(
      result.assertionCandidates.find(
        (candidate) => candidate.coverageFallback !== true
      )?.applyStatus
    ).toBe("applied");
  });

  it("keeps fallback eligible when it is the only candidate on a step", async () => {
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
        confidence: 0.76,
        rationale:
          "Coverage fallback: verify interacted element remains visible after action.",
        candidateSource: "deterministic",
        coverageFallback: true,
      },
    ]);

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "balanced",
      applyAssertions: true,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [],
      diagnostics: [],
    });

    expect(result.appliedAssertions).toBe(1);
    expect(result.skippedAssertions).toBe(0);
    expect(result.assertionCandidates[0]?.coverageFallback).toBe(true);
    expect(result.assertionCandidates[0]?.applyStatus).toBe("applied");
    expect(result.assertionCandidates[0]?.applyMessage).toBeUndefined();
    expect(
      result.outputSteps.some(
        (step) =>
          step.action === "assertVisible" && step.target.value === "#submit"
      )
    ).toBe(true);
  });
});
