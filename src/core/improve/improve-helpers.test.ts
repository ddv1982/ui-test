import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import { dedupeAssertionCandidates } from "./improve-helpers.js";

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
