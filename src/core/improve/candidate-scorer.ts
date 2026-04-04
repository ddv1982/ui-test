import type { Page } from "playwright";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { detectTargetDynamicSignals } from "./dynamic-target.js";
import {
  buildCandidateScoreComponents,
  scoreRuntimeResolutionFailed,
  scoreTargetCandidateWithRuntime,
  scoreTargetCandidateWithoutRuntime,
} from "./candidate-scorer-support.js";

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
    const components = buildCandidateScoreComponents(candidate, dynamicSignals);

    if (!page) {
      scored.push({
        ...scoreTargetCandidateWithoutRuntime({
          candidate,
          baseScore: components.baseScore,
          repairBonus: components.repairBonus,
          dynamicPenalty: components.dynamicPenalty,
          candidateReasonCodes: components.candidateReasonCodes,
        }),
        sortIndex,
      });
      continue;
    }

    try {
      const locator = resolveLocator(page, candidate.target);
      const matchCount = await locator.count();
      const isVisible =
        matchCount > 0 && (await locator.first().isVisible({ timeout: timeoutMs }));

      scored.push({
        ...scoreTargetCandidateWithRuntime({
          candidate,
          baseScore: components.baseScore,
          repairBonus: components.repairBonus,
          dynamicPenalty: components.dynamicPenalty,
          candidateReasonCodes: components.candidateReasonCodes,
          hasPlaywrightRuntimeRepairReason:
            components.hasPlaywrightRuntimeRepairReason,
          isDynamicTarget: components.isDynamicTarget,
          matchCount,
          isVisible,
        }),
        sortIndex,
      });
    } catch {
      scored.push({
        ...scoreRuntimeResolutionFailed({
          candidate,
          baseScore: components.baseScore,
          repairBonus: components.repairBonus,
          dynamicPenalty: components.dynamicPenalty,
          candidateReasonCodes: components.candidateReasonCodes,
        }),
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
