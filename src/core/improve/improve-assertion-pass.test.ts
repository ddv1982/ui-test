import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import { runImproveAssertionPass } from "./improve-assertion-pass.js";

const { buildAssertionCandidatesMock } = vi.hoisted(() => ({
  buildAssertionCandidatesMock: vi.fn<
    typeof import("./assertion-candidates.js").buildAssertionCandidates
  >(() => []),
}));
const { buildSnapshotInventoryAssertionCandidatesMock } = vi.hoisted(() => ({
  buildSnapshotInventoryAssertionCandidatesMock: vi.fn<
    typeof import("./assertion-candidates-inventory.js").buildSnapshotInventoryAssertionCandidates
  >(() => []),
}));
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

vi.mock("./assertion-candidates.js", () => ({
  buildAssertionCandidates: buildAssertionCandidatesMock,
}));

vi.mock("./assertion-candidates-inventory.js", () => ({
  buildSnapshotInventoryAssertionCandidates:
    buildSnapshotInventoryAssertionCandidatesMock,
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
    buildSnapshotInventoryAssertionCandidatesMock.mockReturnValue([]);
  });

  it("keeps fallback as backup-only when a stronger candidate exists for the same step", async () => {
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
    ).toContain("coverage fallback assertions are backup-only");
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

  it("adds inventory candidates for uncovered snapshot-native steps", async () => {
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
    buildSnapshotInventoryAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#status", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.79,
        rationale:
          "Coverage fallback (inventory): full post-step aria inventory yielded high-signal text.",
        candidateSource: "snapshot_native",
        coverageFallback: true,
      },
    ]);

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "snapshot-native",
      assertionPolicy: "balanced",
      applyAssertions: false,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [
        {
          index: 1,
          step: { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
          preSnapshot: "- generic [ref=e1]:\n",
          postSnapshot: "- generic [ref=e1]:\n",
        },
      ],
      diagnostics: [],
    });

    expect(buildSnapshotInventoryAssertionCandidatesMock).toHaveBeenCalledTimes(1);
    expect(result.inventoryStepsEvaluated).toBe(1);
    expect(result.inventoryCandidatesAdded).toBe(1);
    expect(result.inventoryGapStepsFilled).toBe(1);
    expect(
      result.assertionCandidates.some(
        (candidate) =>
          candidate.candidateSource === "snapshot_native" &&
          candidate.coverageFallback === true
      )
    ).toBe(true);
  });

  it("does not run inventory harvesting when non-fallback candidates already cover a step", async () => {
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#status", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.9,
        rationale: "high-signal text",
        candidateSource: "deterministic",
      },
    ]);

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "snapshot-native",
      assertionPolicy: "balanced",
      applyAssertions: false,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [
        {
          index: 1,
          step: { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
          preSnapshot: "- generic [ref=e1]:\n",
          postSnapshot: "- generic [ref=e1]:\n",
        },
      ],
      diagnostics: [],
    });

    expect(buildSnapshotInventoryAssertionCandidatesMock).not.toHaveBeenCalled();
    expect(result.inventoryStepsEvaluated).toBe(0);
    expect(result.inventoryCandidatesAdded).toBe(0);
    expect(result.inventoryGapStepsFilled).toBe(0);
  });

  it("does not run inventory harvesting for deterministic assertion source", async () => {
    buildAssertionCandidatesMock.mockReturnValue(baseCandidates());

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "balanced",
      applyAssertions: false,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [
        {
          index: 1,
          step: { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
          preSnapshot: "- generic [ref=e1]:\n",
          postSnapshot: "- generic [ref=e1]:\n",
        },
      ],
      diagnostics: [],
    });

    expect(buildSnapshotInventoryAssertionCandidatesMock).not.toHaveBeenCalled();
    expect(result.inventoryStepsEvaluated).toBe(0);
    expect(result.inventoryCandidatesAdded).toBe(0);
    expect(result.inventoryGapStepsFilled).toBe(0);
  });

  it("prefers URL assertions over coverage fallback visibility checks", async () => {
    buildAssertionCandidatesMock.mockReturnValue({
      candidates: [
        {
          index: 1,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#headline-link", kind: "css", source: "manual" },
          },
          confidence: 0.76,
          rationale: "Coverage fallback: verify interacted element remains visible after action.",
          candidateSource: "deterministic",
          coverageFallback: true,
        },
      ],
      skippedNavigationLikeClicks: [],
    } as any);

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "snapshot-native",
      assertionPolicy: "balanced",
      applyAssertions: true,
      page: {} as any,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#headline-link", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [
        {
          index: 1,
          step: {
            action: "click",
            target: { value: "#headline-link", kind: "css", source: "manual" },
          },
          preSnapshot: "- generic [ref=e1]:\n  - link \"Old headline\"",
          postSnapshot: "- generic [ref=e1]:\n  - heading \"Article page\"",
          preUrl: "https://example.com/news",
          postUrl: "https://example.com/news/article-123",
          preTitle: "News",
          postTitle: "Article page",
        },
      ],
      diagnostics: [],
    });

    expect(
      result.assertionCandidates.some(
        (candidate) =>
          candidate.candidate.action === "assertUrl" &&
          candidate.applyStatus === "applied"
      )
    ).toBe(true);
    expect(
      result.assertionCandidates.some(
        (candidate) =>
          candidate.coverageFallback === true &&
          candidate.applyStatus !== "applied"
      )
    ).toBe(true);
  });

  it("emits diagnostics when deterministic fallback is skipped for navigation-like clicks", async () => {
    buildAssertionCandidatesMock.mockReturnValue({
      candidates: [],
      skippedNavigationLikeClicks: [
        {
          index: 1,
          reason: "navigation-like dynamic click target",
        },
      ],
    } as any);
    const diagnostics: import("./report-schema.js").ImproveDiagnostic[] = [];

    const result = await runImproveAssertionPass({
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "balanced",
      applyAssertions: false,
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#headline-link", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [],
      diagnostics,
    });

    expect(result.deterministicAssertionsSkippedNavigationLikeClick).toBe(1);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "deterministic_assertion_skipped_navigation_like_click"
      )
    ).toBe(true);
  });
});
