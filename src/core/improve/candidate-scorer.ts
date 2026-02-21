import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { detectTargetDynamicSignals } from "./dynamic-target.js";
import { roundScore } from "./score-math.js";

export interface TargetCandidateScore {
  candidate: TargetCandidate;
  score: number;
  baseScore: number;
  uniquenessScore: number;
  visibilityScore: number;
  matchCount?: number;
  runtimeChecked: boolean;
  reasonCodes: string[];
}

export async function scoreTargetCandidates(
  page: Page | undefined,
  candidates: TargetCandidate[],
  timeoutMs = 1_500
): Promise<TargetCandidateScore[]> {
  const scored: Array<TargetCandidateScore & { sortIndex: number }> = [];

  for (let sortIndex = 0; sortIndex < candidates.length; sortIndex += 1) {
    const candidate = candidates[sortIndex];
    if (!candidate) continue;

    const dynamicSignals = candidate.dynamicSignals ?? detectTargetDynamicSignals(candidate.target);
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

    if (!page) {
      scored.push({
        candidate,
        score: roundScore(clamp01(baseScore + repairBonus - dynamicPenalty)),
        baseScore,
        uniquenessScore: 0,
        visibilityScore: 0,
        runtimeChecked: false,
        reasonCodes: [...candidateReasonCodes, "runtime_unavailable"],
        sortIndex,
      });
      continue;
    }

    try {
      const locator = resolveLocator(page, candidate.target);
      const matchCount = await locator.count();
      const uniquenessScore = matchCount === 1 ? 1 : matchCount === 0 ? 0 : 0.3;
      const visibilityScore =
        matchCount > 0 && (await locator.first().isVisible({ timeout: timeoutMs })) ? 1 : 0;
      const playwrightRuntimeRepairBonus =
        hasPlaywrightRuntimeRepairReason && isDynamicTarget && matchCount === 1 ? 0.02 : 0;

      const score = roundScore(
        clamp01(
          baseScore * 0.5 +
            uniquenessScore * 0.35 +
            visibilityScore * 0.15 +
            repairBonus -
            dynamicPenalty +
            playwrightRuntimeRepairBonus
        )
      );
      const reasonCodes = [...candidateReasonCodes];

      if (matchCount === 0) reasonCodes.push("no_matches");
      if (matchCount > 1) reasonCodes.push("multiple_matches");
      if (matchCount === 1) reasonCodes.push("unique_match");
      if (visibilityScore === 1) reasonCodes.push("visible_match");
      if (repairBonus > 0) reasonCodes.push("repair_bonus");
      if (dynamicPenalty > 0) reasonCodes.push("dynamic_penalty");
      if (playwrightRuntimeRepairBonus > 0) {
        reasonCodes.push("playwright_runtime_repair_bonus");
      }

      scored.push({
        candidate,
        score,
        baseScore,
        uniquenessScore,
        visibilityScore,
        matchCount,
        runtimeChecked: true,
        reasonCodes,
        sortIndex,
      });
    } catch {
      scored.push({
        candidate,
        score: roundScore(clamp01(baseScore * 0.5 + repairBonus - dynamicPenalty)),
        baseScore,
        uniquenessScore: 0,
        visibilityScore: 0,
        runtimeChecked: true,
        reasonCodes: [...candidateReasonCodes, "runtime_resolution_failed"],
        sortIndex,
      });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.sortIndex - b.sortIndex;
    })
    .map((entry) => {
      const { sortIndex, ...candidateScore } = entry;
      void sortIndex;
      return candidateScore;
    });
}

export function shouldAdoptCandidate(
  current: TargetCandidateScore,
  suggested: TargetCandidateScore,
  threshold = 0.15
): boolean {
  if (suggested.candidate.target.value === current.candidate.target.value) return false;
  return suggested.score - current.score >= threshold;
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
  switch (target.kind) {
    case "locatorExpression":
      return 1;
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
