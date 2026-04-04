import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { type StepSnapshot } from "./assertion-candidates/assertion-candidates-snapshot.js";
import {
  type ImproveAssertionPolicy,
  type ImproveAssertionSource,
  type ImproveAssertionsMode,
} from "./improve-types.js";
import { resolveAssertionPolicyConfig } from "./assertion-policy.js";
import {
  applyAssertionCandidates,
  buildRawAssertionCandidates,
} from "./improve-assertion-pass-support.js";
import type {
  AssertionCandidate,
  ImproveDiagnostic,
  StepFinding,
} from "./report-schema.js";

export interface AssertionPassResult {
  outputSteps: Step[];
  assertionCandidates: AssertionCandidate[];
  appliedAssertions: number;
  skippedAssertions: number;
  filteredDynamicCandidates: number;
  deterministicAssertionsSkippedNavigationLikeClick: number;
  inventoryStepsEvaluated: number;
  inventoryCandidatesAdded: number;
  inventoryGapStepsFilled: number;
}

export async function runImproveAssertionPass(input: {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  assertionPolicy: ImproveAssertionPolicy;
  applyAssertions: boolean;
  allowRuntimeAssertionApply?: boolean;
  page?: Page;
  outputSteps: Step[];
  findings: StepFinding[];
  outputStepOriginalIndexes: number[];
  nativeStepSnapshots: StepSnapshot[];
  testBaseUrl?: string;
  diagnostics: ImproveDiagnostic[];
}): Promise<AssertionPassResult> {
  let outputSteps = [...input.outputSteps];
  const assertionPolicyConfig = resolveAssertionPolicyConfig(input.assertionPolicy);

  const rawCandidates = buildRawAssertionCandidates({
    assertions: input.assertions,
    assertionSource: input.assertionSource,
    outputSteps,
    findings: input.findings,
    outputStepOriginalIndexes: input.outputStepOriginalIndexes,
    nativeStepSnapshots: input.nativeStepSnapshots,
    diagnostics: input.diagnostics,
  });
  const rawAssertionCandidates = rawCandidates.rawAssertionCandidates;

  let assertionCandidates: AssertionCandidate[] = rawAssertionCandidates.map((candidate) => ({
    ...candidate,
    applyStatus: "not_requested" as const,
  }));
  let appliedAssertions = 0;
  let skippedAssertions = 0;
  let filteredDynamicCandidates = 0;

  if (input.applyAssertions && input.page) {
    const applied = await applyAssertionCandidates({
      page: input.page,
      outputSteps,
      rawAssertionCandidates,
      outputStepOriginalIndexes: input.outputStepOriginalIndexes,
      ...(input.testBaseUrl !== undefined ? { testBaseUrl: input.testBaseUrl } : {}),
      assertionPolicyConfig,
      allowRuntimeAssertionApply: input.allowRuntimeAssertionApply ?? true,
      diagnostics: input.diagnostics,
    });
    outputSteps = applied.outputSteps;
    assertionCandidates = applied.assertionCandidates;
    appliedAssertions = applied.appliedAssertions;
    skippedAssertions = applied.skippedAssertions;
    filteredDynamicCandidates = applied.filteredDynamicCandidates;
  }

  return {
    outputSteps,
    assertionCandidates,
    appliedAssertions,
    skippedAssertions,
    filteredDynamicCandidates,
    deterministicAssertionsSkippedNavigationLikeClick:
      rawCandidates.deterministicAssertionsSkippedNavigationLikeClick,
    inventoryStepsEvaluated: rawCandidates.inventoryStepsEvaluated,
    inventoryCandidatesAdded: rawCandidates.inventoryCandidatesAdded,
    inventoryGapStepsFilled: rawCandidates.inventoryGapStepsFilled,
  };
}
