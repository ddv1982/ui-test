import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssertionCandidate, ImproveDiagnostic } from "./report-schema.js";

import type * as assertionCandidatesModule from "./assertion-candidates/assertion-candidates.js";
import type * as snapshotNativeModule from "./assertion-candidates/assertion-candidates-snapshot-native.js";
import type * as inventoryModule from "./improve-assertion-inventory.js";

const { buildAssertionCandidatesMock } = vi.hoisted(() => ({
  buildAssertionCandidatesMock: vi.fn<
    typeof assertionCandidatesModule.buildAssertionCandidates
  >(() => ({
    candidates: [],
    skippedNavigationLikeClicks: [],
  })),
}));

const { buildSnapshotNativeAssertionCandidatesMock } = vi.hoisted(() => ({
  buildSnapshotNativeAssertionCandidatesMock: vi.fn<
    typeof snapshotNativeModule.buildSnapshotNativeAssertionCandidates
  >(() => []),
}));

const { augmentCandidatesWithSnapshotInventoryMock } = vi.hoisted(() => ({
  augmentCandidatesWithSnapshotInventoryMock: vi.fn<
    typeof inventoryModule.augmentCandidatesWithSnapshotInventory
  >((input) => ({
    candidates: input.candidates,
    inventoryStepsEvaluated: 0,
    inventoryCandidatesAdded: 0,
    inventoryGapStepsFilled: 0,
  })),
}));

vi.mock("./assertion-candidates/assertion-candidates.js", () => ({
  buildAssertionCandidates: buildAssertionCandidatesMock,
}));

vi.mock("./assertion-candidates/assertion-candidates-snapshot-native.js", () => ({
  buildSnapshotNativeAssertionCandidates: buildSnapshotNativeAssertionCandidatesMock,
}));

vi.mock("./improve-assertion-inventory.js", () => ({
  augmentCandidatesWithSnapshotInventory: augmentCandidatesWithSnapshotInventoryMock,
}));

import { buildRawAssertionCandidates } from "./improve-assertion-pass-support.js";

function sampleCandidate(): AssertionCandidate {
  return {
    index: 1,
    afterAction: "click",
    candidate: {
      action: "assertVisible",
      target: { value: "#submit", kind: "css", source: "manual" },
    },
    confidence: 0.8,
    rationale: "deterministic candidate",
    candidateSource: "deterministic",
  };
}

describe("improve-assertion-pass-support", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildAssertionCandidatesMock.mockReturnValue({
      candidates: [],
      skippedNavigationLikeClicks: [],
    });
    buildSnapshotNativeAssertionCandidatesMock.mockReturnValue([]);
    augmentCandidatesWithSnapshotInventoryMock.mockImplementation((input) => ({
      candidates: input.candidates,
      inventoryStepsEvaluated: 0,
      inventoryCandidatesAdded: 0,
      inventoryGapStepsFilled: 0,
    }));
  });

  it("records deterministic skipped navigation-like clicks", () => {
    buildAssertionCandidatesMock.mockReturnValue({
      candidates: [sampleCandidate()],
      skippedNavigationLikeClicks: [{ index: 1, reason: "navigation-like click" }],
    });
    const diagnostics: ImproveDiagnostic[] = [];

    const result = buildRawAssertionCandidates({
      assertions: "candidates",
      assertionSource: "deterministic",
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [],
      diagnostics,
    });

    expect(result.rawAssertionCandidates).toHaveLength(1);
    expect(result.deterministicAssertionsSkippedNavigationLikeClick).toBe(1);
    expect(diagnostics.map((item) => item.code)).toContain(
      "deterministic_assertion_skipped_navigation_like_click"
    );
  });

  it("warns and falls back when snapshot-native has no snapshots", () => {
    buildAssertionCandidatesMock.mockReturnValue({
      candidates: [sampleCandidate()],
      skippedNavigationLikeClicks: [],
    });
    const diagnostics: ImproveDiagnostic[] = [];

    const result = buildRawAssertionCandidates({
      assertions: "candidates",
      assertionSource: "snapshot-native",
      outputSteps: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      ],
      findings: [],
      outputStepOriginalIndexes: [0, 1],
      nativeStepSnapshots: [],
      diagnostics,
    });

    expect(result.rawAssertionCandidates).toHaveLength(1);
    expect(diagnostics.map((item) => item.code)).toContain(
      "assertion_source_snapshot_native_empty"
    );
    expect(buildSnapshotNativeAssertionCandidatesMock).not.toHaveBeenCalled();
  });
});
