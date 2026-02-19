import type { AssertionCandidate } from "./report-schema.js";

const VOLATILE_KEYWORDS = new Set([
  "weather",
  "winterweer",
  "storm",
  "update",
  "liveblog",
  "breaking",
  "sneeuw",
  "regen",
  "rain",
  "today",
  "vandaag",
  "live",
  "video",
  "gisteren",
  "yesterday",
]);

const HIGH_SIGNAL_ROLES = new Set(["heading", "alert", "status"]);
const HARD_FILTER_VOLATILITY_FLAGS = new Set([
  "contains_numeric_fragment",
  "contains_date_or_time_fragment",
  "contains_weather_or_news_fragment",
  "long_text",
  "contains_headline_like_text",
  "contains_pipe_separator",
]);

export function assessAssertionCandidateStability(
  candidate: AssertionCandidate
): Pick<AssertionCandidate, "stabilityScore" | "volatilityFlags"> {
  let score = candidate.confidence;
  const volatilityFlags: string[] = [];

  if (candidate.afterAction === "navigate") {
    score -= 0.18;
    volatilityFlags.push("navigate_context");
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

  if (candidate.candidate.action === "assertText") {
    const text = candidate.candidate.text.trim();
    if (text.length >= 4 && text.length <= 48) {
      score += 0.05;
    } else if (text.length > 90) {
      score -= 0.08;
      volatilityFlags.push("long_text");
    }

    const targetRole = readGetByRoleName(candidate.candidate.target.value)?.role;
    if (targetRole && HIGH_SIGNAL_ROLES.has(targetRole)) {
      score += 0.08;
    }

    const volatility = detectVolatility(text);
    volatilityFlags.push(...volatility);
    if (volatility.length > 0) {
      score -= 0.22;
    }
  }

  if (candidate.candidate.action === "assertVisible" && candidate.candidateSource === "snapshot_native") {
    score -= 0.06;
  }

  return {
    stabilityScore: clamp01(round3(score)),
    volatilityFlags: [...new Set(volatilityFlags)],
  };
}

export function shouldFilterVolatileSnapshotTextCandidate(
  candidate: AssertionCandidate
): boolean {
  return (
    candidate.candidateSource === "snapshot_native" &&
    candidate.candidate.action === "assertText" &&
    (candidate.volatilityFlags ?? []).some((flag) =>
      HARD_FILTER_VOLATILITY_FLAGS.has(flag)
    )
  );
}

export function clampSmartSnapshotCandidateVolume(
  candidates: AssertionCandidate[]
): Set<number> {
  const byStep = new Map<number, Array<{ candidate: AssertionCandidate; candidateIndex: number }>>();
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    if (!candidate || candidate.candidateSource !== "snapshot_native") continue;
    const list = byStep.get(candidate.index) ?? [];
    list.push({ candidate, candidateIndex });
    byStep.set(candidate.index, list);
  }

  const cappedIndexes = new Set<number>();
  for (const [, stepCandidates] of byStep) {
    const cap = stepCandidates[0]?.candidate.afterAction === "navigate" ? 1 : 2;
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

function detectVolatility(text: string): string[] {
  const out: string[] = [];
  const normalized = text.trim().toLowerCase();
  if (!normalized) return out;

  if (/\b\d{2,}\b/.test(normalized)) out.push("contains_numeric_fragment");
  if (
    /\b\d{1,2}[:.]\d{2}\b/.test(normalized) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)
  ) {
    out.push("contains_date_or_time_fragment");
  }

  for (const keyword of VOLATILE_KEYWORDS) {
    if (normalized.includes(keyword)) {
      out.push("contains_weather_or_news_fragment");
      break;
    }
  }

  // Headline-like text: >= 30 chars, 5+ words, mixed case
  const original = text.trim();
  if (original.length >= 30) {
    const words = original.split(/\s+/).filter((w) => w.length > 0);
    const hasUpperCase = /[A-Z]/.test(original);
    const hasLowerCase = /[a-z]/.test(original);
    if (words.length >= 5 && hasUpperCase && hasLowerCase) {
      out.push("contains_headline_like_text");
    }
  }

  // Pipe separator (common in news headline concatenations)
  if (normalized.includes("|")) {
    out.push("contains_pipe_separator");
  }

  return out;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
