import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepNetworkIdle,
} from "../runtime/network-idle.js";
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
  forcedByCoverage?: boolean;
}

export interface AssertionApplyValidationOptions {
  timeout: number;
  baseUrl?: string;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
  forceApplyOnRuntimeFailureCandidateIndexes?: Set<number>;
}

export interface AssertionInsertion {
  sourceIndex: number;
  assertionStep: Step;
}

export function selectCandidatesForApply(
  candidates: AssertionCandidate[],
  minConfidence: number,
  alwaysApplyCandidateIndexes: Set<number> | number[] = []
): {
  selected: AssertionCandidateRef[];
  skippedLowConfidence: AssertionApplyOutcome[];
} {
  const selected: AssertionCandidateRef[] = [];
  const skippedLowConfidence: AssertionApplyOutcome[] = [];
  const alwaysApplySet =
    alwaysApplyCandidateIndexes instanceof Set
      ? alwaysApplyCandidateIndexes
      : new Set(alwaysApplyCandidateIndexes);

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!candidate) continue;

    if (alwaysApplySet.has(candidateIndex)) {
      selected.push({ candidateIndex, candidate });
      continue;
    }

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
  const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;
  const networkIdleTimeout = options.networkIdleTimeout ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
  const forceApplySet = options.forceApplyOnRuntimeFailureCandidateIndexes ?? new Set<number>();

  for (const candidateRef of candidates) {
    if (isDuplicateSourceOrAdjacentAssertion(steps, candidateRef.candidate.index, candidateRef.candidate.candidate)) {
      outcomes.push({
        candidateIndex: candidateRef.candidateIndex,
        applyStatus: "skipped_existing",
        applyMessage: "Equivalent assertion already exists at source step or adjacent position.",
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
      const networkIdleTimedOut = await waitForPostStepNetworkIdle(
        page,
        waitForNetworkIdle,
        networkIdleTimeout
      );
      if (networkIdleTimedOut) {
        for (const candidateRef of candidatesByStepIndex.get(index) ?? []) {
          const forceApply = forceApplySet.has(candidateRef.candidateIndex);
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: forceApply ? "applied" : "skipped_runtime_failure",
            applyMessage: forceApply
              ? `Forced apply after runtime validation failure: post-step network idle not reached within ${networkIdleTimeout}ms.`
              : `Post-step network idle not reached within ${networkIdleTimeout}ms; assertion skipped.`,
            ...(forceApply ? { forcedByCoverage: true } : {}),
          });
        }
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown runtime replay failure.";
      for (const [stepIndex, stepCandidates] of candidatesByStepIndex) {
        if (stepIndex < index) continue;
        for (const candidateRef of stepCandidates) {
          const forceApply = forceApplySet.has(candidateRef.candidateIndex);
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: forceApply ? "applied" : "skipped_runtime_failure",
            applyMessage: forceApply
              ? `Forced apply after runtime validation failure: runtime replay failed at step ${index + 1}: ${message}`
              : `Runtime replay failed at step ${index + 1}: ${message}`,
            ...(forceApply ? { forcedByCoverage: true } : {}),
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
        const forceApply = forceApplySet.has(candidateRef.candidateIndex);
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: forceApply ? "applied" : "skipped_runtime_failure",
          applyMessage: forceApply
            ? `Forced apply after runtime validation failure: ${err instanceof Error ? err.message : "Assertion runtime validation failed."}`
            : err instanceof Error
              ? err.message
              : "Assertion runtime validation failed.",
          ...(forceApply ? { forcedByCoverage: true } : {}),
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

function isDuplicateSourceOrAdjacentAssertion(
  steps: Step[],
  sourceIndex: number,
  candidate: Step
): boolean {
  const source = steps[sourceIndex];
  if (source && areEquivalentAssertions(source, candidate)) {
    return true;
  }

  return isDuplicateAdjacentAssertion(steps, sourceIndex, candidate);
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
