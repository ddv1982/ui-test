import type { Step } from "../yaml-schema.js";
import type { AssertionCandidate } from "./report-schema.js";

const ASSERTION_COVERAGE_ACTIONS = new Set<Step["action"]>([
  "click",
  "press",
  "hover",
  "fill",
  "select",
  "check",
  "uncheck",
]);

export function buildAssertionCoverageSummary(
  steps: Step[],
  originalStepIndexes: number[],
  candidates: AssertionCandidate[]
): {
  total: number;
  withCandidates: number;
  withApplied: number;
  candidateRate: number;
  appliedRate: number;
} {
  const coverageStepIndexes = new Set<number>();
  for (let runtimeIndex = 0; runtimeIndex < steps.length; runtimeIndex += 1) {
    const step = steps[runtimeIndex];
    if (!step || !ASSERTION_COVERAGE_ACTIONS.has(step.action)) continue;
    const originalIndex = originalStepIndexes[runtimeIndex] ?? runtimeIndex;
    coverageStepIndexes.add(originalIndex);
  }

  const candidateStepIndexes = new Set<number>();
  const appliedStepIndexes = new Set<number>();
  for (const candidate of candidates) {
    if (!coverageStepIndexes.has(candidate.index)) continue;
    candidateStepIndexes.add(candidate.index);
    if (candidate.applyStatus === "applied") {
      appliedStepIndexes.add(candidate.index);
    }
  }

  const total = coverageStepIndexes.size;
  const withCandidates = candidateStepIndexes.size;
  const withApplied = appliedStepIndexes.size;
  return {
    total,
    withCandidates,
    withApplied,
    candidateRate: roundCoverageRate(withCandidates, total),
    appliedRate: roundCoverageRate(withApplied, total),
  };
}

function roundCoverageRate(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 1000;
}

export function buildAssertionFallbackApplySummary(
  candidates: AssertionCandidate[]
): {
  applied: number;
  appliedOnlySteps: number;
  appliedWithNonFallbackSteps: number;
} {
  const fallbackAppliedSteps = new Set<number>();
  const nonFallbackAppliedSteps = new Set<number>();
  let applied = 0;

  for (const candidate of candidates) {
    if (candidate.applyStatus !== "applied") continue;
    if (candidate.coverageFallback === true) {
      applied += 1;
      fallbackAppliedSteps.add(candidate.index);
      continue;
    }
    nonFallbackAppliedSteps.add(candidate.index);
  }

  let appliedOnlySteps = 0;
  let appliedWithNonFallbackSteps = 0;
  for (const stepIndex of fallbackAppliedSteps) {
    if (nonFallbackAppliedSteps.has(stepIndex)) {
      appliedWithNonFallbackSteps += 1;
      continue;
    }
    appliedOnlySteps += 1;
  }

  return {
    applied,
    appliedOnlySteps,
    appliedWithNonFallbackSteps,
  };
}
