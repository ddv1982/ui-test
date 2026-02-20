import type { Page } from "playwright";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  waitForPostStepNetworkIdle,
} from "../runtime/network-idle.js";
import type { Step, Target } from "../yaml-schema.js";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
} from "./report-schema.js";
import type { AssertionPolicyConfig } from "./assertion-policy.js";
import {
  ASSERTION_POLICY_CONFIG,
  DEFAULT_IMPROVE_ASSERTION_POLICY,
} from "./assertion-policy.js";

const DEFAULT_ASSERTION_POLICY_CONFIG =
  ASSERTION_POLICY_CONFIG[DEFAULT_IMPROVE_ASSERTION_POLICY];

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
  waitForNetworkIdle?: boolean;
  policyConfig?: AssertionPolicyConfig;
}

export interface AssertionInsertion {
  sourceIndex: number;
  assertionStep: Step;
}

export interface SelectCandidatesForApplyOptions {
  perCandidateMinConfidence?: (candidate: AssertionCandidate) => number;
  forcedPolicyMessages?: Map<number, string>;
  useStabilityScore?: boolean;
  policyConfig?: AssertionPolicyConfig;
}

export function selectCandidatesForApply(
  candidates: AssertionCandidate[],
  minConfidence: number,
  options?: SelectCandidatesForApplyOptions
): {
  selected: AssertionCandidateRef[];
  skippedLowConfidence: AssertionApplyOutcome[];
  skippedPolicy: AssertionApplyOutcome[];
} {
  const policyConfig = options?.policyConfig ?? DEFAULT_ASSERTION_POLICY_CONFIG;
  const selected: AssertionCandidateRef[] = [];
  const skippedLowConfidence: AssertionApplyOutcome[] = [];
  const skippedPolicy: AssertionApplyOutcome[] = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!candidate) continue;

    const forcedPolicyMessage = options?.forcedPolicyMessages?.get(candidateIndex);
    if (forcedPolicyMessage) {
      skippedPolicy.push({
        candidateIndex,
        applyStatus: "skipped_policy",
        applyMessage: forcedPolicyMessage,
      });
      continue;
    }

    if (!isAutoApplyAllowedByPolicy(candidate, policyConfig)) {
      skippedPolicy.push({
        candidateIndex,
        applyStatus: "skipped_policy",
        applyMessage:
          "Skipped by policy: reliable mode only auto-applies snapshot assertVisible candidates when stable structural.",
      });
      continue;
    }

    const threshold = options?.perCandidateMinConfidence?.(candidate) ?? minConfidence;
    const confidenceValue =
      options?.useStabilityScore === true
        ? candidate.stabilityScore ?? candidate.confidence
        : candidate.confidence;

    if (confidenceValue >= threshold) {
      selected.push({ candidateIndex, candidate });
      continue;
    }

    skippedLowConfidence.push({
      candidateIndex,
      applyStatus: "skipped_low_confidence",
      applyMessage:
        `Candidate score ${confidenceValue.toFixed(3)} is below threshold ${threshold.toFixed(3)}.`,
    });
  }

  return { selected, skippedLowConfidence, skippedPolicy };
}

export async function validateCandidatesAgainstRuntime(
  page: Page,
  steps: Step[],
  candidates: AssertionCandidateRef[],
  options: AssertionApplyValidationOptions
): Promise<AssertionApplyOutcome[]> {
  const policyConfig = options.policyConfig ?? DEFAULT_ASSERTION_POLICY_CONFIG;
  const outcomes: AssertionApplyOutcome[] = [];
  const candidatesByStepIndex = new Map<number, AssertionCandidateRef[]>();
  const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;

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

  for (const [stepIndex, stepCandidates] of candidatesByStepIndex) {
    stepCandidates.sort((left, right) =>
      compareAssertionCandidateRefs(left, right, policyConfig)
    );
    candidatesByStepIndex.set(stepIndex, stepCandidates);
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
        waitForNetworkIdle
      );
      if (networkIdleTimedOut) {
        for (const candidateRef of candidatesByStepIndex.get(index) ?? []) {
          outcomes.push({
            candidateIndex: candidateRef.candidateIndex,
            applyStatus: "skipped_runtime_failure",
            applyMessage: "Post-step network idle wait timed out; assertion skipped.",
          });
        }
        continue;
      }
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
    let appliedForStep = 0;
    let appliedNonFallbackForStep = false;
    for (const candidateRef of stepCandidates) {
      if (appliedForStep >= policyConfig.appliedAssertionsPerStepCap) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_policy",
          applyMessage:
            `Skipped by policy: max ${policyConfig.appliedAssertionsPerStepCap} applied assertion(s) per source step.`,
        });
        continue;
      }
      if (
        candidateRef.candidate.coverageFallback === true &&
        appliedNonFallbackForStep
      ) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_policy",
          applyMessage:
            "Skipped by policy: coverage fallback assertions are backup-only once a stronger assertion is applied for this step.",
        });
        continue;
      }
      try {
        await executeRuntimeStep(page, candidateRef.candidate.candidate, {
          timeout: options.timeout,
          baseUrl: options.baseUrl,
          mode: "playback",
        });
        appliedForStep += 1;
        if (candidateRef.candidate.coverageFallback !== true) {
          appliedNonFallbackForStep = true;
        }
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "applied",
        });
      } catch (err) {
        outcomes.push({
          candidateIndex: candidateRef.candidateIndex,
          applyStatus: "skipped_runtime_failure",
          applyMessage:
            err instanceof Error
              ? err.message
              : "Assertion runtime validation failed.",
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

function compareAssertionCandidateRefs(
  left: AssertionCandidateRef,
  right: AssertionCandidateRef,
  policyConfig: AssertionPolicyConfig
): number {
  const fallbackDelta =
    coverageFallbackPriority(left.candidate) - coverageFallbackPriority(right.candidate);
  if (fallbackDelta !== 0) return fallbackDelta;

  if (left.candidate.coverageFallback === true && right.candidate.coverageFallback === true) {
    const fallbackSourceDelta =
      candidateSourcePriority(left.candidate.candidateSource) -
      candidateSourcePriority(right.candidate.candidateSource);
    if (fallbackSourceDelta !== 0) return fallbackSourceDelta;
  }

  const leftScore = left.candidate.stabilityScore ?? left.candidate.confidence;
  const rightScore = right.candidate.stabilityScore ?? right.candidate.confidence;
  const scoreDelta = rightScore - leftScore;
  if (scoreDelta !== 0) return scoreDelta;

  const confidenceDelta = right.candidate.confidence - left.candidate.confidence;
  if (confidenceDelta !== 0) return confidenceDelta;

  const actionDelta =
    assertionActionPriority(left.candidate.candidate.action, policyConfig) -
    assertionActionPriority(right.candidate.candidate.action, policyConfig);
  if (actionDelta !== 0) return actionDelta;

  const sourceDelta =
    candidateSourcePriority(left.candidate.candidateSource) -
    candidateSourcePriority(right.candidate.candidateSource);
  if (sourceDelta !== 0) return sourceDelta;

  return left.candidateIndex - right.candidateIndex;
}

function assertionActionPriority(
  action: Step["action"],
  policyConfig: AssertionPolicyConfig
): number {
  if (action === "assertValue") return policyConfig.actionPriorityForApply.assertValue;
  if (action === "assertChecked") return policyConfig.actionPriorityForApply.assertChecked;
  if (action === "assertText") return policyConfig.actionPriorityForApply.assertText;
  if (action === "assertVisible") return policyConfig.actionPriorityForApply.assertVisible;
  return 99;
}

function candidateSourcePriority(source: AssertionCandidate["candidateSource"]): number {
  switch (source) {
    case "deterministic":
      return 0;
    case "snapshot_native":
      return 1;
    default:
      return 2;
  }
}

function coverageFallbackPriority(candidate: AssertionCandidate): number {
  return candidate.coverageFallback === true ? 1 : 0;
}

function isAutoApplyAllowedByPolicy(
  candidate: AssertionCandidate,
  policyConfig: AssertionPolicyConfig
): boolean {
  if (
    candidate.candidateSource === "snapshot_native" &&
    candidate.candidate.action === "assertVisible"
  ) {
    if (policyConfig.allowSnapshotVisible === "runtime_validated") {
      return true;
    }
    return candidate.stableStructural === true;
  }

  return true;
}
