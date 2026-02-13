import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import type { Step, Target } from "../yaml-schema.js";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
} from "./report-schema.js";

export interface AssertionCandidateRef {
  candidateIndex: number;
  candidate: AssertionCandidate;
}

export interface AssertionApplyOutcome {
  candidateIndex: number;
  applyStatus: AssertionApplyStatus;
  applyMessage?: string;
}

export interface AssertionApplyValidationOptions {
  timeout: number;
  baseUrl?: string;
}

export interface AssertionInsertion {
  sourceIndex: number;
  assertionStep: Step;
}

export function selectCandidatesForApply(
  candidates: AssertionCandidate[],
  minConfidence: number
): {
  selected: AssertionCandidateRef[];
  skippedLowConfidence: AssertionApplyOutcome[];
} {
  const selected: AssertionCandidateRef[] = [];
  const skippedLowConfidence: AssertionApplyOutcome[] = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!candidate) continue;

    if (candidate.confidence >= minConfidence) {
      selected.push({ candidateIndex, candidate });
      continue;
    }

    skippedLowConfidence.push({
      candidateIndex,
      applyStatus: "skipped_low_confidence",
      applyMessage: `Candidate confidence ${candidate.confidence.toFixed(3)} is below threshold ${minConfidence.toFixed(3)}.`,
    });
  }

  return { selected, skippedLowConfidence };
}

export async function validateCandidatesAgainstRuntime(
  page: Page,
  steps: Step[],
  candidates: AssertionCandidateRef[],
  options: AssertionApplyValidationOptions
): Promise<AssertionApplyOutcome[]> {
  const outcomes: AssertionApplyOutcome[] = [];
  const candidatesByStepIndex = new Map<number, AssertionCandidateRef[]>();

  for (const candidateRef of candidates) {
    if (isDuplicateAdjacentAssertion(steps, candidateRef.candidate.index, candidateRef.candidate.candidate)) {
      outcomes.push({
        candidateIndex: candidateRef.candidateIndex,
        applyStatus: "skipped_existing",
        applyMessage: "Adjacent identical assertion already exists.",
      });
      continue;
    }

    const existing = candidatesByStepIndex.get(candidateRef.candidate.index) ?? [];
    existing.push(candidateRef);
    candidatesByStepIndex.set(candidateRef.candidate.index, existing);
  }

  if (candidatesByStepIndex.size === 0) return outcomes;
  if ("goto" in page && typeof page.goto === "function") {
    await page
      .goto("about:blank", {
        timeout: options.timeout,
      })
      .catch(() => {});
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step) continue;

    try {
      await executeRuntimeStep(page, step, {
        timeout: options.timeout,
        baseUrl: options.baseUrl,
        mode: "analysis",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown runtime replay failure.";
      for (const [stepIndex, stepCandidates] of candidatesByStepIndex) {
        if (stepIndex < index) continue;
        for (const candidateRef of stepCandidates) {
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: "skipped_runtime_failure",
            applyMessage: `Runtime replay failed at step ${index + 1}: ${message}`,
          });
        }
      }
      return outcomes;
    }

    const stepCandidates = candidatesByStepIndex.get(index) ?? [];
    for (const candidateRef of stepCandidates) {
      try {
        await executeRuntimeStep(page, candidateRef.candidate.candidate, {
          timeout: options.timeout,
          baseUrl: options.baseUrl,
          mode: "playback",
        });
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "applied",
        });
      } catch (err) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_runtime_failure",
          applyMessage: err instanceof Error ? err.message : "Assertion runtime validation failed.",
        });
      }
    }
  }

  return outcomes;
}

export function insertAppliedAssertions(
  steps: Step[],
  appliedCandidates: AssertionInsertion[]
): Step[] {
  if (appliedCandidates.length === 0) return [...steps];

  const out = [...steps];
  const sorted = [...appliedCandidates].sort((left, right) => left.sourceIndex - right.sourceIndex);
  let offset = 0;

  for (const insertion of sorted) {
    const insertAt = insertion.sourceIndex + 1 + offset;
    out.splice(insertAt, 0, insertion.assertionStep);
    offset += 1;
  }

  return out;
}

export function isDuplicateAdjacentAssertion(
  steps: Step[],
  sourceIndex: number,
  candidate: Step
): boolean {
  const adjacent = steps[sourceIndex + 1];
  if (!adjacent) return false;
  return areEquivalentAssertions(adjacent, candidate);
}

function areEquivalentAssertions(left: Step, right: Step): boolean {
  if (left.action !== right.action) return false;

  if (left.action === "assertVisible" && right.action === "assertVisible") {
    return areEquivalentTargets(left.target, right.target);
  }

  if (left.action === "assertText" && right.action === "assertText") {
    return areEquivalentTargets(left.target, right.target) && left.text === right.text;
  }

  if (left.action === "assertValue" && right.action === "assertValue") {
    return areEquivalentTargets(left.target, right.target) && left.value === right.value;
  }

  if (left.action === "assertChecked" && right.action === "assertChecked") {
    const leftChecked = left.checked ?? true;
    const rightChecked = right.checked ?? true;
    return areEquivalentTargets(left.target, right.target) && leftChecked === rightChecked;
  }

  return false;
}

function areEquivalentTargets(left: Target, right: Target): boolean {
  return (
    left.value === right.value &&
    left.kind === right.kind &&
    areFramePathsEqual(left.framePath, right.framePath)
  );
}

function areFramePathsEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftPath = left ?? [];
  const rightPath = right ?? [];
  if (leftPath.length !== rightPath.length) return false;
  return leftPath.every((segment, index) => segment === rightPath[index]);
}
