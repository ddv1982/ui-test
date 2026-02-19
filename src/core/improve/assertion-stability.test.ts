import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import {
  assessAssertionCandidateStability,
  clampSmartSnapshotCandidateVolume,
  shouldFilterVolatileSnapshotTextCandidate,
} from "./assertion-stability.js";

function makeCandidate(partial: Partial<AssertionCandidate>): AssertionCandidate {
  return {
    index: 0,
    afterAction: "click",
    candidate: {
      action: "assertText",
      target: { value: "getByRole('heading', { name: 'Welcome' })", kind: "locatorExpression", source: "manual" },
      text: "Welcome",
    },
    confidence: 0.82,
    rationale: "candidate",
    candidateSource: "snapshot_native",
    ...partial,
  };
}

describe("assertion stability", () => {
  it("flags volatile snapshot text candidates", () => {
    const candidate = makeCandidate({
      afterAction: "navigate",
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Breaking 12:30 update' })", kind: "locatorExpression", source: "manual" },
        text: "Breaking 12:30 update",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect((assessed.volatilityFlags?.length ?? 0)).toBeGreaterThan(0);
    expect((assessed.stabilityScore ?? 1)).toBeLessThan(0.86);
    expect(
      shouldFilterVolatileSnapshotTextCandidate({
        ...candidate,
        ...assessed,
      })
    ).toBe(true);
  });

  it("keeps deterministic form assertions high-stability", () => {
    const candidate = makeCandidate({
      candidateSource: "deterministic",
      candidate: {
        action: "assertValue",
        target: { value: "#name", kind: "css", source: "manual" },
        value: "Alice",
      },
      confidence: 0.78,
    });
    const assessed = assessAssertionCandidateStability(candidate);
    expect((assessed.stabilityScore ?? 0)).toBeGreaterThanOrEqual(0.8);
    expect(assessed.volatilityFlags).toEqual([]);
  });

  it("does not hard-filter navigate-context-only snapshot text candidates", () => {
    const candidate = makeCandidate({
      afterAction: "navigate",
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Welcome' })", kind: "locatorExpression", source: "manual" },
        text: "Welcome",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.volatilityFlags).toContain("navigate_context");
    expect(
      shouldFilterVolatileSnapshotTextCandidate({
        ...candidate,
        ...assessed,
      })
    ).toBe(false);
  });

  it("pushes near-threshold navigate snapshot text below the apply floor", () => {
    const candidate = makeCandidate({
      confidence: 0.91,
      afterAction: "navigate",
      candidate: {
        action: "assertText",
        target: { value: "#hero", kind: "css", source: "manual" },
        text: "Welcome",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect((assessed.stabilityScore ?? 1)).toBeLessThan(0.75);
  });

  it("emits explicit volatility flags for long timestamped snapshot text", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Update' })", kind: "locatorExpression", source: "manual" },
        text: "Winterweer update 2026-02-19 12:30 expected snowfall",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.volatilityFlags).toContain("contains_numeric_fragment");
    expect(assessed.volatilityFlags).toContain("contains_date_or_time_fragment");
    expect(assessed.volatilityFlags).toContain("contains_weather_or_news_fragment");
  });

  it("caps snapshot candidate volume per step in smart mode", () => {
    const candidates: AssertionCandidate[] = [
      makeCandidate({ index: 0, afterAction: "navigate", confidence: 0.9, stabilityScore: 0.9 }),
      makeCandidate({ index: 0, afterAction: "navigate", confidence: 0.8, stabilityScore: 0.8 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.95, stabilityScore: 0.95 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.9, stabilityScore: 0.9 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.85, stabilityScore: 0.85 }),
      makeCandidate({
        index: 2,
        afterAction: "click",
        candidateSource: "deterministic",
        candidate: { action: "assertVisible", target: { value: "#done", kind: "css", source: "manual" } },
        confidence: 0.7,
      }),
    ];

    const cappedIndexes = clampSmartSnapshotCandidateVolume(candidates);
    const keptSnapshotAtNavigate = candidates.filter(
      (candidate, index) =>
        candidate.candidateSource === "snapshot_native" &&
        candidate.index === 0 &&
        !cappedIndexes.has(index)
    );
    const keptSnapshotAtClick = candidates.filter(
      (candidate, index) =>
        candidate.candidateSource === "snapshot_native" &&
        candidate.index === 2 &&
        !cappedIndexes.has(index)
    );

    expect(keptSnapshotAtNavigate).toHaveLength(1);
    expect(keptSnapshotAtClick).toHaveLength(2);
    expect(cappedIndexes.has(5)).toBe(false);
  });

  it("hard-filters headline-like snapshot text candidates", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'News' })", kind: "locatorExpression", source: "manual" },
        text: "Video Dolblije Erben Wennemars viert feest met schaatsploeg na gouden medaille",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.volatilityFlags).toContain("contains_headline_like_text");
    expect(
      shouldFilterVolatileSnapshotTextCandidate({
        ...candidate,
        ...assessed,
      })
    ).toBe(true);
  });

  it("hard-filters pipe-separated snapshot text candidates", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Live' })", kind: "locatorExpression", source: "manual" },
        text: "Live Epstein | Trump vindt documenten",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.volatilityFlags).toContain("contains_pipe_separator");
    expect(
      shouldFilterVolatileSnapshotTextCandidate({
        ...candidate,
        ...assessed,
      })
    ).toBe(true);
  });
});
