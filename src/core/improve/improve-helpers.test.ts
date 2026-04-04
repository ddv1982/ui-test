import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import {
  buildAssertionApplyStatusCounts,
  buildAssertionCandidateSourceCounts,
  buildOriginalToRuntimeIndex,
  buildOutputStepOriginalIndexes,
  dedupeAssertionCandidates,
  defaultReportPath,
} from "./improve-helpers.js";

function makeVisibleCandidate(
  partial: Partial<AssertionCandidate>
): AssertionCandidate {
  return {
    index: 1,
    afterAction: "click",
    candidate: {
      action: "assertVisible",
      target: { value: "#status", kind: "css", source: "manual" },
    },
    confidence: 0.8,
    rationale: "candidate",
    candidateSource: "deterministic",
    ...partial,
  };
}

describe("dedupeAssertionCandidates", () => {
  it("prefers non-fallback candidates over fallback candidates for the same key", () => {
    const fallback = makeVisibleCandidate({
      confidence: 0.95,
      coverageFallback: true,
      rationale: "fallback",
    });
    const nonFallback = makeVisibleCandidate({
      confidence: 0.7,
      coverageFallback: false,
      rationale: "stronger",
    });

    const deduped = dedupeAssertionCandidates([fallback, nonFallback]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.coverageFallback).not.toBe(true);
    expect(deduped[0]?.rationale).toBe("stronger");
  });

  it("prefers higher confidence candidates when fallback class is the same", () => {
    const low = makeVisibleCandidate({
      confidence: 0.8,
      rationale: "low",
    });
    const high = makeVisibleCandidate({
      confidence: 0.9,
      rationale: "high",
    });

    const deduped = dedupeAssertionCandidates([low, high]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.confidence).toBe(0.9);
    expect(deduped[0]?.rationale).toBe("high");
  });

  it("prefers snapshot-native over deterministic at equal confidence", () => {
    const deterministic = makeVisibleCandidate({
      confidence: 0.85,
      rationale: "deterministic",
      candidateSource: "deterministic",
    });
    const snapshot = makeVisibleCandidate({
      confidence: 0.85,
      rationale: "snapshot",
      candidateSource: "snapshot_native",
    });

    const deduped = dedupeAssertionCandidates([deterministic, snapshot]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.candidateSource).toBe("snapshot_native");
    expect(deduped[0]?.rationale).toBe("snapshot");
  });

  it("keeps lower insertion order as final tie-breaker", () => {
    const first = makeVisibleCandidate({
      confidence: 0.85,
      rationale: "first",
      candidateSource: "deterministic",
    });
    const second = makeVisibleCandidate({
      confidence: 0.85,
      rationale: "second",
      candidateSource: "deterministic",
    });

    const deduped = dedupeAssertionCandidates([first, second]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.rationale).toBe("first");
  });
});

describe("other improve helpers", () => {
  it("builds report path next to the input file", () => {
    expect(defaultReportPath("/tmp/login.yaml")).toBe("/tmp/login.improve-report.json");
    expect(defaultReportPath("/tmp/login")).toBe("/tmp/login.improve-report.json");
  });

  it("builds original-to-runtime index maps", () => {
    expect([...buildOriginalToRuntimeIndex([0, 2, 4]).entries()]).toEqual([
      [0, 0],
      [2, 1],
      [4, 2],
    ]);
  });

  it("builds output-step original indexes with stale assertions removed", () => {
    const steps = [
      { action: "navigate" as const, url: "/" },
      {
        action: "assertVisible" as const,
        target: { value: "#a", kind: "css" as const, source: "manual" as const },
      },
      {
        action: "click" as const,
        target: { value: "#b", kind: "css" as const, source: "manual" as const },
      },
    ];

    expect(buildOutputStepOriginalIndexes(steps, [1], true)).toEqual([0, 2]);
    expect(buildOutputStepOriginalIndexes(steps, [1], false)).toEqual([0, 1, 2]);
  });

  it("counts assertion apply statuses and candidate sources", () => {
    const candidates = [
      makeVisibleCandidate({
        applyStatus: "applied",
        candidateSource: "deterministic",
      }),
      makeVisibleCandidate({
        applyStatus: "skipped_policy",
        candidateSource: "snapshot_native",
      }),
      makeVisibleCandidate({
        applyStatus: "applied",
        candidateSource: "snapshot_native",
      }),
    ];

    expect(buildAssertionApplyStatusCounts(candidates)).toEqual({
      applied: 2,
      skipped_policy: 1,
    });
    expect(buildAssertionCandidateSourceCounts(candidates)).toEqual({
      deterministic: 1,
      snapshot_native: 2,
    });
  });
});
