import type { AssertionCandidate } from "./report-schema.js";
import { detectDynamicSignals } from "./dynamic-signal-detection.js";
import type { SnapshotCandidateVolumeCap } from "./assertion-policy.js";

const HIGH_SIGNAL_ROLES = new Set(["heading", "alert", "status"]);
const HARD_FILTER_DYNAMIC_SIGNALS = new Set([
  "contains_numeric_fragment",
  "contains_date_or_time_fragment",
  "contains_weather_or_news_fragment",
  "long_text",
  "contains_headline_like_text",
  "contains_pipe_separator",
]);

const DEFAULT_SNAPSHOT_CANDIDATE_VOLUME_CAP: SnapshotCandidateVolumeCap = {
  navigate: 1,
  other: 2,
};

export function assessAssertionCandidateStability(
  candidate: AssertionCandidate
): Pick<AssertionCandidate, "stabilityScore" | "dynamicSignals"> {
  let score = candidate.confidence;
  const dynamicSignals: string[] = [];

  if (candidate.afterAction === "navigate") {
    score -= 0.18;
    dynamicSignals.push("navigate_context");
  }

  if (candidate.candidateSource === "snapshot_native") {
    score -= 0.04;
  }

  if (
    candidate.candidate.action === "assertValue" ||
    candidate.candidate.action === "assertChecked"
  ) {
    score += 0.08;
  }

  if (candidate.candidate.action === "assertEnabled") {
    score += 0.07;
  }

  if (
    candidate.candidate.action === "assertUrl" ||
    candidate.candidate.action === "assertTitle"
  ) {
    score += 0.05;
  }

  if (candidate.candidate.action === "assertText") {
    const text = candidate.candidate.text.trim();
    if (text.length >= 4 && text.length <= 48) {
      score += 0.05;
    } else if (text.length > 90) {
      score -= 0.08;
      dynamicSignals.push("long_text");
    }

    if ("target" in candidate.candidate) {
      const targetRole = readGetByRoleName(candidate.candidate.target.value)?.role;
      if (targetRole && HIGH_SIGNAL_ROLES.has(targetRole)) {
        score += 0.08;
      }
    }

    const detectedSignals = detectDynamicSignals(text);
    dynamicSignals.push(...detectedSignals);
    if (detectedSignals.length > 0) {
      score -= dynamicPenalty(detectedSignals);
    }
  }

  if (candidate.candidate.action === "assertVisible" && candidate.candidateSource === "snapshot_native") {
    if (candidate.stableStructural === true) {
      score += 0.06;
    } else {
      score -= 0.06;
    }
  }

  return {
    stabilityScore: clamp01(round3(score)),
    dynamicSignals: [...new Set(dynamicSignals)],
  };
}

export function shouldFilterDynamicSnapshotTextCandidate(
  candidate: AssertionCandidate,
  hardFilterDynamicSignals: ReadonlySet<string> = HARD_FILTER_DYNAMIC_SIGNALS
): boolean {
  return (
    candidate.candidateSource === "snapshot_native" &&
    candidate.candidate.action === "assertText" &&
    (candidate.dynamicSignals ?? []).some((flag) =>
      hardFilterDynamicSignals.has(flag)
    )
  );
}

export function clampSmartSnapshotCandidateVolume(
  candidates: AssertionCandidate[],
  volumeCap: SnapshotCandidateVolumeCap = DEFAULT_SNAPSHOT_CANDIDATE_VOLUME_CAP
): Set<number> {
  const byStep = new Map<number, Array<{ candidate: AssertionCandidate; candidateIndex: number }>>();
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!candidate) continue;
    if (candidate.candidateSource !== "snapshot_native") continue;
    const list = byStep.get(candidate.index) ?? [];
    list.push({ candidate, candidateIndex });
    byStep.set(candidate.index, list);
  }

  const cappedIndexes = new Set<number>();
  for (const [, stepCandidates] of byStep) {
    const cap =
      stepCandidates[0]?.candidate.afterAction === "navigate"
        ? volumeCap.navigate
        : volumeCap.other;
    const sorted = [...stepCandidates].sort((left, right) => {
      const leftScore = left.candidate.stabilityScore ?? left.candidate.confidence;
      const rightScore = right.candidate.stabilityScore ?? right.candidate.confidence;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return right.candidate.confidence - left.candidate.confidence;
    });
    for (const entry of sorted.slice(cap)) {
      cappedIndexes.add(entry.candidateIndex);
    }
  }

  return cappedIndexes;
}

function readGetByRoleName(value: string): { role: string; name: string } | undefined {
  const match = /getByRole\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*name:\s*['"]([^'"]+)['"]/.exec(
    value
  );
  if (!match?.[1] || !match?.[2]) return undefined;
  return { role: match[1], name: match[2] };
}

const DYNAMIC_SIGNAL_PENALTIES: Record<string, number> = {
  contains_numeric_fragment: 0.12,
  contains_date_or_time_fragment: 0.15,
  contains_weather_or_news_fragment: 0.15,
  contains_headline_like_text: 0.10,
  contains_pipe_separator: 0.10,
};

const MAX_DYNAMIC_SIGNAL_PENALTY = 0.30;

function dynamicPenalty(flags: string[]): number {
  let total = 0;
  for (const flag of flags) {
    total += DYNAMIC_SIGNAL_PENALTIES[flag] ?? 0.10;
  }
  return Math.min(total, MAX_DYNAMIC_SIGNAL_PENALTY);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
