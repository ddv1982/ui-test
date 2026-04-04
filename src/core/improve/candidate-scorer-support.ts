import type { Target } from "../yaml-schema.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { roundScore } from "./score-math.js";
import { scoreLocatorConfidence } from "../transform/locator-confidence.js";

export interface CandidateScoreComponents {
  baseScore: number;
  dynamicPenalty: number;
  repairBonus: number;
  candidateReasonCodes: string[];
  hasPlaywrightRuntimeRepairReason: boolean;
  isDynamicTarget: boolean;
}

export function buildCandidateScoreComponents(
  candidate: TargetCandidate,
  dynamicSignals: string[]
): CandidateScoreComponents {
  const isDynamicTarget = dynamicSignals.length > 0;
  const hasRepairReason = candidate.reasonCodes.some((reason) =>
    reason.startsWith("locator_repair_")
  );
  const hasPlaywrightRuntimeRepairReason = candidate.reasonCodes.includes(
    "locator_repair_playwright_runtime"
  );
  const baseScore = selectorKindScore(candidate.target, candidate);
  const dynamicPenalty =
    isDynamicTarget && candidate.source === "current"
      ? targetDynamicPenalty(dynamicSignals)
      : 0;
  const repairBonus =
    hasRepairReason && isDynamicTarget
      ? 0.06
      : hasRepairReason
        ? 0.03
        : 0;
  const candidateReasonCodes = [...candidate.reasonCodes];
  if (isDynamicTarget) {
    candidateReasonCodes.push("dynamic_target");
  }

  return {
    baseScore,
    dynamicPenalty,
    repairBonus,
    candidateReasonCodes,
    hasPlaywrightRuntimeRepairReason,
    isDynamicTarget,
  };
}

export function scoreTargetCandidateWithoutRuntime(input: {
  candidate: TargetCandidate;
  baseScore: number;
  repairBonus: number;
  dynamicPenalty: number;
  candidateReasonCodes: string[];
}) {
  return {
    candidate: input.candidate,
    score: roundScore(clamp01(input.baseScore + input.repairBonus - input.dynamicPenalty)),
    baseScore: input.baseScore,
    uniquenessScore: 0,
    visibilityScore: 0,
    runtimeChecked: false,
    reasonCodes: [...input.candidateReasonCodes, "runtime_unavailable"],
  };
}

export function scoreTargetCandidateWithRuntime(input: {
  candidate: TargetCandidate;
  baseScore: number;
  repairBonus: number;
  dynamicPenalty: number;
  candidateReasonCodes: string[];
  hasPlaywrightRuntimeRepairReason: boolean;
  isDynamicTarget: boolean;
  matchCount: number;
  isVisible: boolean;
}) {
  const uniquenessScore = input.matchCount === 1 ? 1 : input.matchCount === 0 ? 0 : 0.3;
  const visibilityScore = input.matchCount > 0 && input.isVisible ? 1 : 0;
  const playwrightRuntimeRepairBonus =
    input.hasPlaywrightRuntimeRepairReason && input.isDynamicTarget && input.matchCount === 1
      ? 0.02
      : 0;

  const score = roundScore(
    clamp01(
      input.baseScore * 0.5 +
        uniquenessScore * 0.35 +
        visibilityScore * 0.15 +
        input.repairBonus -
        input.dynamicPenalty +
        playwrightRuntimeRepairBonus
    )
  );
  const reasonCodes = [...input.candidateReasonCodes];

  if (input.matchCount === 0) reasonCodes.push("no_matches");
  if (input.matchCount > 1) reasonCodes.push("multiple_matches");
  if (input.matchCount === 1) reasonCodes.push("unique_match");
  if (visibilityScore === 1) reasonCodes.push("visible_match");
  if (input.repairBonus > 0) reasonCodes.push("repair_bonus");
  if (input.dynamicPenalty > 0) reasonCodes.push("dynamic_penalty");
  if (playwrightRuntimeRepairBonus > 0) {
    reasonCodes.push("playwright_runtime_repair_bonus");
  }

  return {
    candidate: input.candidate,
    score,
    baseScore: input.baseScore,
    uniquenessScore,
    visibilityScore,
    matchCount: input.matchCount,
    runtimeChecked: true,
    reasonCodes,
  };
}

export function scoreRuntimeResolutionFailed(input: {
  candidate: TargetCandidate;
  baseScore: number;
  repairBonus: number;
  dynamicPenalty: number;
  candidateReasonCodes: string[];
}) {
  return {
    candidate: input.candidate,
    score: roundScore(clamp01(input.baseScore * 0.5 + input.repairBonus - input.dynamicPenalty)),
    baseScore: input.baseScore,
    uniquenessScore: 0,
    visibilityScore: 0,
    runtimeChecked: true,
    reasonCodes: [...input.candidateReasonCodes, "runtime_resolution_failed"],
  };
}

function selectorKindScore(
  target: Target,
  candidate: TargetCandidate
): number {
  const base = selectorKindScoreByKind(target);

  const hasRepairReason = candidate.reasonCodes.some((reason) =>
    reason.startsWith("locator_repair_")
  );
  if (!hasRepairReason) return base;

  return Math.min(1, base + 0.05);
}

function targetDynamicPenalty(signals: string[]): number {
  let penalty = 0.08;
  if (signals.includes("exact_true")) {
    penalty += 0.05;
  }
  if (
    signals.includes("contains_headline_like_text") ||
    signals.includes("contains_weather_or_news_fragment")
  ) {
    penalty += 0.04;
  }
  return Math.min(penalty, 0.2);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function selectorKindScoreByKind(target: Target): number {
  if (typeof target.confidence === "number") {
    return target.confidence;
  }

  switch (target.kind) {
    case "locatorExpression":
      return scoreLocatorConfidence(target.value);
    case "playwrightSelector":
      return 0.75;
    case "css":
      return 0.45;
    case "xpath":
      return 0.35;
    case "internal":
      return 0.2;
    case "unknown":
    default:
      return 0.1;
  }
}
