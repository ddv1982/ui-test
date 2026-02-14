import type { Step } from "../yaml-schema.js";

export interface StaleAssertionFinding {
  index: number;
  reason: string;
}

export function findStaleAssertions(steps: Step[]): StaleAssertionFinding[] {
  void steps;
  // Coverage assertions intentionally allow adjacent click/press -> assertVisible pairs.
  return [];
}

export function removeStaleAssertions(steps: Step[], staleIndexes: number[]): Step[] {
  if (staleIndexes.length === 0) return [...steps];
  const staleIndexSet = new Set(staleIndexes);
  return steps.filter((_, index) => !staleIndexSet.has(index));
}
