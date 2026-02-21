import type { Step, Target } from "../yaml-schema.js";
import type { AssertionInsertion } from "./assertion-apply-types.js";

export function insertAppliedAssertions(
  steps: Step[],
  appliedCandidates: AssertionInsertion[]
): Step[] {
  if (appliedCandidates.length === 0) return [...steps];

  const out = [...steps];
  const sorted = [...appliedCandidates].sort(
    (left, right) => left.sourceIndex - right.sourceIndex
  );
  let offset = 0;

  for (const insertion of sorted) {
    const insertAt = insertion.sourceIndex + 1 + offset;
    out.splice(insertAt, 0, insertion.assertionStep);
    offset += 1;
  }

  return out;
}

export function isDuplicateAdjacentAssertion(
  steps: Step[],
  sourceIndex: number,
  candidate: Step
): boolean {
  const adjacent = steps[sourceIndex + 1];
  if (!adjacent) return false;
  return areEquivalentAssertions(adjacent, candidate);
}

export function isDuplicateSourceOrAdjacentAssertion(
  steps: Step[],
  sourceIndex: number,
  candidate: Step
): boolean {
  const source = steps[sourceIndex];
  if (source && areEquivalentAssertions(source, candidate)) {
    return true;
  }

  return isDuplicateAdjacentAssertion(steps, sourceIndex, candidate);
}

function areEquivalentAssertions(left: Step, right: Step): boolean {
  if (left.action !== right.action) return false;

  if (left.action === "assertVisible" && right.action === "assertVisible") {
    return areEquivalentTargets(left.target, right.target);
  }

  if (left.action === "assertText" && right.action === "assertText") {
    return areEquivalentTargets(left.target, right.target) && left.text === right.text;
  }

  if (left.action === "assertValue" && right.action === "assertValue") {
    return areEquivalentTargets(left.target, right.target) && left.value === right.value;
  }

  if (left.action === "assertChecked" && right.action === "assertChecked") {
    const leftChecked = left.checked ?? true;
    const rightChecked = right.checked ?? true;
    return areEquivalentTargets(left.target, right.target) && leftChecked === rightChecked;
  }

  if (left.action === "assertEnabled" && right.action === "assertEnabled") {
    const leftEnabled = left.enabled ?? true;
    const rightEnabled = right.enabled ?? true;
    return areEquivalentTargets(left.target, right.target) && leftEnabled === rightEnabled;
  }

  if (left.action === "assertUrl" && right.action === "assertUrl") {
    return left.url === right.url;
  }

  if (left.action === "assertTitle" && right.action === "assertTitle") {
    return left.title === right.title;
  }

  return false;
}

function areEquivalentTargets(left: Target, right: Target): boolean {
  return (
    left.value === right.value &&
    left.kind === right.kind &&
    areFramePathsEqual(left.framePath, right.framePath)
  );
}

function areFramePathsEqual(
  left: string[] | undefined,
  right: string[] | undefined
): boolean {
  const leftPath = left ?? [];
  const rightPath = right ?? [];
  if (leftPath.length !== rightPath.length) return false;
  return leftPath.every((segment, index) => segment === rightPath[index]);
}
