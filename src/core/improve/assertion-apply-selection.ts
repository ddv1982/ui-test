import type { Step } from "../yaml-schema.js";
import type { AssertionPolicyConfig } from "./assertion-policy.js";
import {
  ASSERTION_POLICY_CONFIG,
  DEFAULT_IMPROVE_ASSERTION_POLICY,
} from "./assertion-policy.js";
import type { AssertionCandidate } from "./report-schema.js";
import type {
  AssertionApplyOutcome,
  AssertionCandidateRef,
  SelectCandidatesForApplyOptions,
} from "./assertion-apply-types.js";

export const DEFAULT_ASSERTION_POLICY_CONFIG: AssertionPolicyConfig =
  ASSERTION_POLICY_CONFIG[DEFAULT_IMPROVE_ASSERTION_POLICY];

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

  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex += 1
  ) {
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

export function compareAssertionCandidateRefs(
  left: AssertionCandidateRef,
  right: AssertionCandidateRef,
  policyConfig: AssertionPolicyConfig
): number {
  const fallbackDelta =
    coverageFallbackPriority(left.candidate) -
    coverageFallbackPriority(right.candidate);
  if (fallbackDelta !== 0) return fallbackDelta;

  if (
    left.candidate.coverageFallback === true &&
    right.candidate.coverageFallback === true
  ) {
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
  if (action === "assertUrl") return policyConfig.actionPriorityForApply.assertUrl;
  if (action === "assertTitle") return policyConfig.actionPriorityForApply.assertTitle;
  if (action === "assertValue") return policyConfig.actionPriorityForApply.assertValue;
  if (action === "assertChecked") return policyConfig.actionPriorityForApply.assertChecked;
  if (action === "assertText") return policyConfig.actionPriorityForApply.assertText;
  if (action === "assertEnabled") return policyConfig.actionPriorityForApply.assertEnabled;
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
