import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { TargetCandidate } from "./candidate-generator.js";

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
  const scored: TargetCandidateScore[] = [];

  for (const candidate of candidates) {
    const baseScore = selectorKindScore(candidate.target);

    if (!page) {
      scored.push({
        candidate,
        score: roundScore(baseScore),
        baseScore,
        uniquenessScore: 0,
        visibilityScore: 0,
        runtimeChecked: false,
        reasonCodes: [...candidate.reasonCodes, "runtime_unavailable"],
      });
      continue;
    }

    try {
      const locator = resolveLocator(page, candidate.target);
      const matchCount = await locator.count();
      const uniquenessScore = matchCount === 1 ? 1 : matchCount === 0 ? 0 : 0.3;
      const visibilityScore =
        matchCount > 0 && (await locator.first().isVisible({ timeout: timeoutMs })) ? 1 : 0;

      const score = roundScore(baseScore * 0.5 + uniquenessScore * 0.35 + visibilityScore * 0.15);
      const reasonCodes = [...candidate.reasonCodes];

      if (matchCount === 0) reasonCodes.push("no_matches");
      if (matchCount > 1) reasonCodes.push("multiple_matches");
      if (matchCount === 1) reasonCodes.push("unique_match");
      if (visibilityScore === 1) reasonCodes.push("visible_match");

      scored.push({
        candidate,
        score,
        baseScore,
        uniquenessScore,
        visibilityScore,
        matchCount,
        runtimeChecked: true,
        reasonCodes,
      });
    } catch {
      scored.push({
        candidate,
        score: roundScore(baseScore * 0.5),
        baseScore,
        uniquenessScore: 0,
        visibilityScore: 0,
        runtimeChecked: true,
        reasonCodes: [...candidate.reasonCodes, "runtime_resolution_failed"],
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

export function shouldAdoptCandidate(
  current: TargetCandidateScore,
  suggested: TargetCandidateScore,
  threshold = 0.15
): boolean {
  if (suggested.candidate.target.value === current.candidate.target.value) return false;
  return suggested.score - current.score >= threshold;
}

function selectorKindScore(target: Target): number {
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

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
