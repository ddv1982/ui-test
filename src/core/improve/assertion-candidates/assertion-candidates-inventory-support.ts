import type { AssertionCandidate } from "../report-schema.js";

export const INVENTORY_TEXT_ROLES = new Set([
  "heading",
  "status",
  "alert",
  "link",
  "tab",
]);

export const INVENTORY_VISIBLE_ROLES = new Set([
  "main",
  "dialog",
  "status",
  "alert",
]);

export const MAX_INVENTORY_CANDIDATES_PER_STEP = 2;
export const INVENTORY_TEXT_CONFIDENCE = 0.79;
export const INVENTORY_VISIBLE_CONFIDENCE = 0.77;

type AssertionTargetStep = Extract<AssertionCandidate["candidate"], { target: unknown }>;

export function candidatesForStep(
  candidates: AssertionCandidate[],
  stepIndex: number
): number {
  let count = 0;
  for (const candidate of candidates) {
    if (candidate.index === stepIndex) count += 1;
  }
  return count;
}

export function buildExcludedTargetKeys(
  textCandidates: AssertionCandidate[],
  normalizeForCompare: (value: string) => string
): Set<string> {
  return new Set(
    textCandidates
      .map((candidate) => candidate.candidate)
      .filter(isAssertionTargetStep)
      .map((candidateStep) => normalizeForCompare(candidateStep.target.value))
  );
}

export function textRolePriority(role: string): number {
  switch (role) {
    case "heading":
      return 0;
    case "status":
      return 1;
    case "alert":
      return 2;
    case "link":
      return 3;
    case "tab":
      return 4;
    default:
      return 5;
  }
}

export function visibleRolePriority(role: string): number {
  switch (role) {
    case "navigation":
      return 0;
    case "banner":
      return 1;
    case "main":
      return 2;
    case "contentinfo":
      return 3;
    case "dialog":
      return 4;
    case "status":
      return 5;
    case "alert":
      return 6;
    default:
      return 7;
  }
}

function isAssertionTargetStep(
  step: AssertionCandidate["candidate"]
): step is AssertionTargetStep {
  return "target" in step && Boolean(step.target);
}
