import type { Step } from "../yaml-schema.js";
import { buildSnapshotInventoryAssertionCandidates } from "./assertion-candidates-inventory.js";
import type { StepSnapshot } from "./assertion-candidates-snapshot.js";
import { dedupeAssertionCandidates } from "./improve-helpers.js";
import type {
  ImproveAssertionSource,
  ImproveAssertionsMode,
} from "./improve-types.js";
import type { AssertionCandidate } from "./report-schema.js";

const ASSERTION_COVERAGE_ACTIONS = new Set<Step["action"]>([
  "click",
  "press",
  "hover",
  "fill",
  "select",
  "check",
  "uncheck",
]);

export function augmentCandidatesWithSnapshotInventory(input: {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  nativeStepSnapshots: StepSnapshot[];
  outputSteps: Step[];
  outputStepOriginalIndexes: number[];
  candidates: AssertionCandidate[];
}): {
  candidates: AssertionCandidate[];
  inventoryStepsEvaluated: number;
  inventoryCandidatesAdded: number;
  inventoryGapStepsFilled: number;
} {
  let rawAssertionCandidates = input.candidates;
  let inventoryStepsEvaluated = 0;
  let inventoryCandidatesAdded = 0;
  let inventoryGapStepsFilled = 0;

  if (
    input.assertions !== "candidates" ||
    input.assertionSource !== "snapshot-native" ||
    input.nativeStepSnapshots.length === 0
  ) {
    return {
      candidates: rawAssertionCandidates,
      inventoryStepsEvaluated,
      inventoryCandidatesAdded,
      inventoryGapStepsFilled,
    };
  }

  const coverageStepIndexes = collectCoverageStepOriginalIndexes(
    input.outputSteps,
    input.outputStepOriginalIndexes
  );
  const stepsWithNonFallbackCandidates = new Set<number>();
  for (const candidate of rawAssertionCandidates) {
    if (candidate.coverageFallback === true) continue;
    if (!coverageStepIndexes.has(candidate.index)) continue;
    stepsWithNonFallbackCandidates.add(candidate.index);
  }

  const uncoveredStepIndexes: number[] = [];
  for (const stepIndex of coverageStepIndexes) {
    if (stepsWithNonFallbackCandidates.has(stepIndex)) continue;
    uncoveredStepIndexes.push(stepIndex);
  }

  inventoryStepsEvaluated = uncoveredStepIndexes.length;

  if (inventoryStepsEvaluated === 0) {
    return {
      candidates: rawAssertionCandidates,
      inventoryStepsEvaluated,
      inventoryCandidatesAdded,
      inventoryGapStepsFilled,
    };
  }

  const uncoveredStepSet = new Set(uncoveredStepIndexes);
  const filteredSnapshots = input.nativeStepSnapshots.filter((snapshot) => {
    const originalIndex = input.outputStepOriginalIndexes[snapshot.index] ?? snapshot.index;
    return uncoveredStepSet.has(originalIndex);
  });

  const inventoryCandidates = buildSnapshotInventoryAssertionCandidates(
    filteredSnapshots
  ).map((candidate) => ({
    ...candidate,
    index: input.outputStepOriginalIndexes[candidate.index] ?? candidate.index,
  }));

  if (inventoryCandidates.length > 0) {
    const beforeCount = rawAssertionCandidates.length;
    rawAssertionCandidates = dedupeAssertionCandidates([
      ...rawAssertionCandidates,
      ...inventoryCandidates,
    ]);
    inventoryCandidatesAdded = Math.max(0, rawAssertionCandidates.length - beforeCount);
  }

  const gapStepsFilled = new Set<number>();
  for (const candidate of rawAssertionCandidates) {
    if (candidate.candidateSource !== "snapshot_native") continue;
    if (candidate.coverageFallback !== true) continue;
    if (!uncoveredStepSet.has(candidate.index)) continue;
    gapStepsFilled.add(candidate.index);
  }
  inventoryGapStepsFilled = gapStepsFilled.size;

  return {
    candidates: rawAssertionCandidates,
    inventoryStepsEvaluated,
    inventoryCandidatesAdded,
    inventoryGapStepsFilled,
  };
}

function collectCoverageStepOriginalIndexes(
  steps: Step[],
  outputStepOriginalIndexes: number[]
): Set<number> {
  const out = new Set<number>();
  for (let runtimeIndex = 0; runtimeIndex < steps.length; runtimeIndex += 1) {
    const step = steps[runtimeIndex];
    if (!step || !ASSERTION_COVERAGE_ACTIONS.has(step.action)) continue;
    out.add(outputStepOriginalIndexes[runtimeIndex] ?? runtimeIndex);
  }
  return out;
}
