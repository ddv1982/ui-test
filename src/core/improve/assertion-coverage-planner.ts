import type { Step, Target } from "../yaml-schema.js";
import type { AssertionCandidate } from "./report-schema.js";

export interface AssertionCoveragePlanResult {
  candidates: AssertionCandidate[];
  requiredCandidateIndexes: number[];
  fallbackCandidateIndexes: number[];
}

export function planAssertionCoverage(
  steps: Step[],
  originalStepIndexes: number[],
  candidates: AssertionCandidate[]
): AssertionCoveragePlanResult {
  const plannedCandidates = [...candidates];
  const candidatesBySourceIndex = new Map<number, number[]>();

  for (let candidateIndex = 0; candidateIndex < plannedCandidates.length; candidateIndex += 1) {
    const candidate = plannedCandidates[candidateIndex];
    if (!candidate) continue;
    const existing = candidatesBySourceIndex.get(candidate.index) ?? [];
    existing.push(candidateIndex);
    candidatesBySourceIndex.set(candidate.index, existing);
  }

  const requiredCandidateIndexes: number[] = [];
  const fallbackCandidateIndexes: number[] = [];

  for (let runtimeIndex = 0; runtimeIndex < steps.length; runtimeIndex += 1) {
    const step = steps[runtimeIndex];
    if (!step || !isCoveredAction(step)) continue;

    const sourceIndex = originalStepIndexes[runtimeIndex] ?? runtimeIndex;
    const stepCandidateIndexes = candidatesBySourceIndex.get(sourceIndex) ?? [];
    const primaryCandidateIndex = choosePrimaryCandidateIndex(
      step,
      plannedCandidates,
      stepCandidateIndexes
    );

    if (primaryCandidateIndex !== undefined) {
      requiredCandidateIndexes.push(primaryCandidateIndex);
      continue;
    }

    const fallback = buildFallbackCandidate(step, sourceIndex);
    const fallbackCandidateIndex = plannedCandidates.push(fallback) - 1;
    requiredCandidateIndexes.push(fallbackCandidateIndex);
    fallbackCandidateIndexes.push(fallbackCandidateIndex);

    const existing = candidatesBySourceIndex.get(sourceIndex) ?? [];
    existing.push(fallbackCandidateIndex);
    candidatesBySourceIndex.set(sourceIndex, existing);
  }

  return {
    candidates: plannedCandidates,
    requiredCandidateIndexes,
    fallbackCandidateIndexes,
  };
}

function choosePrimaryCandidateIndex(
  step: Exclude<Step, { action: "navigate" }>,
  candidates: AssertionCandidate[],
  indexes: number[]
): number | undefined {
  if (indexes.length === 0) return undefined;

  if (step.action === "fill") {
    const preferred = indexes.find((candidateIndex) => {
      const candidate = candidates[candidateIndex]?.candidate;
      return (
        candidate?.action === "assertValue" &&
        candidate.value === step.text &&
        areEquivalentTargets(candidate.target, step.target)
      );
    });
    if (preferred !== undefined) return preferred;
  }

  if (step.action === "select") {
    const preferred = indexes.find((candidateIndex) => {
      const candidate = candidates[candidateIndex]?.candidate;
      return (
        candidate?.action === "assertValue" &&
        candidate.value === step.value &&
        areEquivalentTargets(candidate.target, step.target)
      );
    });
    if (preferred !== undefined) return preferred;
  }

  if (step.action === "check" || step.action === "uncheck") {
    const expected = step.action === "check";
    const preferred = indexes.find((candidateIndex) => {
      const candidate = candidates[candidateIndex]?.candidate;
      return (
        candidate?.action === "assertChecked" &&
        (candidate.checked ?? true) === expected &&
        areEquivalentTargets(candidate.target, step.target)
      );
    });
    if (preferred !== undefined) return preferred;
  }

  if (step.action === "click" || step.action === "press" || step.action === "hover") {
    const textOffTarget = indexes.find((candidateIndex) => {
      const candidate = candidates[candidateIndex]?.candidate;
      return (
        candidate?.action === "assertText" &&
        !areEquivalentTargets(candidate.target, step.target)
      );
    });
    if (textOffTarget !== undefined) return textOffTarget;

    const visibleOffTarget = indexes.find((candidateIndex) => {
      const candidate = candidates[candidateIndex]?.candidate;
      return (
        candidate?.action === "assertVisible" &&
        !areEquivalentTargets(candidate.target, step.target)
      );
    });
    if (visibleOffTarget !== undefined) return visibleOffTarget;

    const visibleOnTarget = indexes.find(
      (candidateIndex) => candidates[candidateIndex]?.candidate.action === "assertVisible"
    );
    if (visibleOnTarget !== undefined) return visibleOnTarget;
  }

  return undefined;
}

function buildFallbackCandidate(
  step: Exclude<Step, { action: "navigate" }>,
  sourceIndex: number
): AssertionCandidate {
  if (isAssertionStep(step)) {
    return {
      index: sourceIndex,
      afterAction: step.action,
      candidate: cloneNonNavigateStep(step),
      confidence: 0.55,
      rationale:
        "Coverage fallback for assertion step; existing assertion semantics are preserved.",
      candidateSource: "deterministic",
    };
  }

  return {
    index: sourceIndex,
    afterAction: step.action,
    candidate: {
      action: "assertVisible",
      target: cloneTarget(step.target),
    },
    confidence: 0.55,
    rationale:
      "Fallback coverage assertion to guarantee at least one post-action check for this step.",
    candidateSource: "deterministic",
  };
}

function isCoveredAction(step: Step): step is Exclude<Step, { action: "navigate" }> {
  return step.action !== "navigate";
}

function isAssertionStep(
  step: Exclude<Step, { action: "navigate" }>
): step is Extract<
  Exclude<Step, { action: "navigate" }>,
  { action: "assertVisible" | "assertText" | "assertValue" | "assertChecked" }
> {
  return (
    step.action === "assertVisible" ||
    step.action === "assertText" ||
    step.action === "assertValue" ||
    step.action === "assertChecked"
  );
}

function cloneNonNavigateStep(step: Exclude<Step, { action: "navigate" }>): Exclude<Step, { action: "navigate" }> {
  return {
    ...step,
    target: cloneTarget(step.target),
  };
}

function cloneTarget(target: Target): Target {
  return {
    ...target,
    ...(target.framePath ? { framePath: [...target.framePath] } : {}),
  };
}

function areEquivalentTargets(left: Target, right: Target): boolean {
  return (
    left.kind === right.kind &&
    normalizeTargetValue(left) === normalizeTargetValue(right) &&
    areFramePathsEqual(left.framePath, right.framePath)
  );
}

function areFramePathsEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftPath = left ?? [];
  const rightPath = right ?? [];
  if (leftPath.length !== rightPath.length) return false;
  return leftPath.every((segment, index) => segment === rightPath[index]);
}

function normalizeTargetValue(target: Target): string {
  let normalized = collapseWhitespace(target.value);
  if (target.kind === "locatorExpression" || target.kind === "playwrightSelector") {
    normalized = normalized
      .replace(/"/g, "'")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\s*,\s*/g, ", ");
  }
  return normalized;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
