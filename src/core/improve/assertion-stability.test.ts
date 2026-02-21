import { describe, expect, it } from "vitest";
import type { AssertionCandidate } from "./report-schema.js";
import {
  assessAssertionCandidateStability,
  clampSmartSnapshotCandidateVolume,
  shouldFilterDynamicSnapshotTextCandidate,
} from "./assertion-stability.js";
import { ASSERTION_POLICY_CONFIG } from "./assertion-policy.js";

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
  it("flags dynamic snapshot text candidates", () => {
    const candidate = makeCandidate({
      afterAction: "navigate",
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Breaking 12:30 update' })", kind: "locatorExpression", source: "manual" },
        text: "Breaking 12:30 update",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect((assessed.dynamicSignals?.length ?? 0)).toBeGreaterThan(0);
    expect((assessed.stabilityScore ?? 1)).toBeLessThan(0.86);
    expect(
      shouldFilterDynamicSnapshotTextCandidate({
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
    expect(assessed.dynamicSignals).toEqual([]);
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
    expect(assessed.dynamicSignals).toContain("navigate_context");
    expect(
      shouldFilterDynamicSnapshotTextCandidate({
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

  it("emits explicit dynamic flags for long timestamped snapshot text", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Update' })", kind: "locatorExpression", source: "manual" },
        text: "Winterweer update 2026-02-19 12:30 expected snowfall",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.dynamicSignals).toContain("contains_numeric_fragment");
    expect(assessed.dynamicSignals).toContain("contains_date_or_time_fragment");
    expect(assessed.dynamicSignals).toContain("contains_weather_or_news_fragment");
  });

  it("applies graduated penalties instead of flat penalty for dynamic flags", () => {
    const numericOnly = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Score' })", kind: "locatorExpression", source: "manual" },
        text: "Score is 42 points",
      },
    });
    const numericResult = assessAssertionCandidateStability(numericOnly);
    // contains_numeric_fragment: penalty 0.12 (not flat 0.22)
    expect((numericResult.stabilityScore ?? 0)).toBeGreaterThan(0.7);

    const multiFlag = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'News' })", kind: "locatorExpression", source: "manual" },
        text: "Breaking 12:30 update 2026-02-19",
      },
    });
    const multiResult = assessAssertionCandidateStability(multiFlag);
    // Multiple flags: numeric (0.12) + date (0.15) + weather (0.15) = 0.42, capped at 0.30
    expect(multiResult.dynamicSignals).toContain("contains_numeric_fragment");
    expect(multiResult.dynamicSignals).toContain("contains_date_or_time_fragment");
    expect(multiResult.dynamicSignals).toContain("contains_weather_or_news_fragment");
    expect((multiResult.stabilityScore ?? 1)).toBeLessThan(0.7);
  });

  it("detects pipe separator as a dynamic flag", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Nav' })", kind: "locatorExpression", source: "manual" },
        text: "Home | News | Sports",
      },
    });
    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.dynamicSignals).toContain("contains_pipe_separator");
  });

  it("gives stable structural assertVisible a scoring bonus", () => {
    const stableCandidate = makeCandidate({
      candidate: {
        action: "assertVisible",
        target: { value: "getByRole('navigation', { name: 'Main menu' })", kind: "locatorExpression", source: "codegen-fallback" },
      },
      confidence: 0.84,
      stableStructural: true,
    });
    const stableResult = assessAssertionCandidateStability(stableCandidate);
    // 0.84 - 0.04 (snapshot_native) + 0.06 (stable structural) = 0.86
    expect((stableResult.stabilityScore ?? 0)).toBeCloseTo(0.86, 2);

    const nonStableCandidate = makeCandidate({
      candidate: {
        action: "assertVisible",
        target: { value: "getByRole('heading', { name: 'Welcome' })", kind: "locatorExpression", source: "codegen-fallback" },
      },
      confidence: 0.78,
    });
    const nonStableResult = assessAssertionCandidateStability(nonStableCandidate);
    // 0.78 - 0.04 (snapshot_native) - 0.06 (non-stable assertVisible) = 0.68
    expect((nonStableResult.stabilityScore ?? 0)).toBeCloseTo(0.68, 2);
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
    expect(assessed.dynamicSignals).toContain("contains_headline_like_text");
    expect(
      shouldFilterDynamicSnapshotTextCandidate({
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
    expect(assessed.dynamicSignals).toContain("contains_pipe_separator");
    expect(
      shouldFilterDynamicSnapshotTextCandidate({
        ...candidate,
        ...assessed,
      })
    ).toBe(true);
  });

  it("does not hard-filter numeric/date-only dynamic in balanced mode", () => {
    const candidate = makeCandidate({
      candidate: {
        action: "assertText",
        target: { value: "getByRole('heading', { name: 'Weather' })", kind: "locatorExpression", source: "manual" },
        text: "Weather update 2026-02-20 12:30",
      },
    });

    const assessed = assessAssertionCandidateStability(candidate);
    expect(assessed.dynamicSignals).toContain("contains_date_or_time_fragment");
    expect(assessed.dynamicSignals).toContain("contains_weather_or_news_fragment");
    expect(
      shouldFilterDynamicSnapshotTextCandidate(
        { ...candidate, ...assessed },
        ASSERTION_POLICY_CONFIG.balanced.hardFilterDynamicSignals
      )
    ).toBe(false);
  });

  it("uses profile-driven snapshot volume cap when provided", () => {
    const candidates: AssertionCandidate[] = [
      makeCandidate({ index: 0, afterAction: "navigate", confidence: 0.91, stabilityScore: 0.91 }),
      makeCandidate({ index: 0, afterAction: "navigate", confidence: 0.9, stabilityScore: 0.9 }),
      makeCandidate({ index: 0, afterAction: "navigate", confidence: 0.89, stabilityScore: 0.89 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.95, stabilityScore: 0.95 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.94, stabilityScore: 0.94 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.93, stabilityScore: 0.93 }),
      makeCandidate({ index: 2, afterAction: "click", confidence: 0.92, stabilityScore: 0.92 }),
    ];

    const cappedIndexes = clampSmartSnapshotCandidateVolume(
      candidates,
      ASSERTION_POLICY_CONFIG.balanced.snapshotCandidateVolumeCap
    );

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

    expect(keptSnapshotAtNavigate).toHaveLength(2);
    expect(keptSnapshotAtClick).toHaveLength(3);
  });
});
