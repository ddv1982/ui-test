import type { Step, Target } from "../yaml-schema.js";

export interface StaleAssertionFinding {
  index: number;
  reason: string;
}

const STALE_REASON_ADJACENT_CLICK_PRESS_ASSERT_VISIBLE =
  "adjacent_click_press_same_target_assert_visible";

export function findStaleAssertions(steps: Step[]): StaleAssertionFinding[] {
  const findings: StaleAssertionFinding[] = [];

  for (let index = 0; index < steps.length - 1; index += 1) {
    const currentStep = steps[index];
    const nextStep = steps[index + 1];
    if (!currentStep || !nextStep) continue;
    if (!isStaleAdjacentPair(currentStep, nextStep)) continue;

    findings.push({
      index: index + 1,
      reason: STALE_REASON_ADJACENT_CLICK_PRESS_ASSERT_VISIBLE,
    });
  }

  return findings;
}

export function removeStaleAssertions(steps: Step[], staleIndexes: number[]): Step[] {
  if (staleIndexes.length === 0) return [...steps];
  const staleIndexSet = new Set(staleIndexes);
  return steps.filter((_, index) => !staleIndexSet.has(index));
}

function isStaleAdjacentPair(left: Step, right: Step): boolean {
  if (left.action !== "click" && left.action !== "press") return false;
  if (right.action !== "assertVisible") return false;
  return areEquivalentTargets(left.target, right.target);
}

function areEquivalentTargets(left: Target, right: Target): boolean {
  return (
    left.kind === right.kind &&
    normalizeTargetValue(left) === normalizeTargetValue(right) &&
    areFramePathsEqual(left.framePath, right.framePath)
  );
}

function areFramePathsEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftPath = (left ?? []).map(normalizeFramePathSegment);
  const rightPath = (right ?? []).map(normalizeFramePathSegment);
  if (leftPath.length !== rightPath.length) return false;
  return leftPath.every((segment, index) => segment === rightPath[index]);
}

function normalizeTargetValue(target: Target): string {
  let normalized = collapseWhitespace(target.value);
  if (target.kind === "locatorExpression" || target.kind === "playwrightSelector") {
    normalized = normalized
      .replace(/"/g, "'")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/\s*,\s*/g, ", ");
  }
  return normalized;
}

function normalizeFramePathSegment(value: string): string {
  return collapseWhitespace(value);
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
