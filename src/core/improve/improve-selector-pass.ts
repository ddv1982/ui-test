import type { Page } from "playwright";
import type { Step, Target } from "../yaml-schema.js";
import type { StepSnapshot } from "./assertion-candidates/assertion-candidates-snapshot.js";
import type { ImproveDiagnostic, StepFinding } from "./report-schema.js";
import {
  applySelectorMetrics,
  isPlaywrightRuntimeRegenerationDisabled,
  processRuntimeStep,
  processSelectorStep,
} from "./improve-selector-pass-support.js";

export interface SelectorPassResult {
  outputSteps: Step[];
  findings: StepFinding[];
  nativeStepSnapshots: StepSnapshot[];
  failedStepIndexes: number[];
  runtimeObservedUrls: string[];
  selectorRepairCandidates: number;
  selectorRepairsApplied: number;
  selectorRepairsAdoptedOnTie: number;
  selectorRepairsGeneratedByPlaywrightRuntime: number;
  selectorRepairsAppliedFromPlaywrightRuntime: number;
}

export async function runImproveSelectorPass(input: {
  steps: Step[];
  outputStepOriginalIndexes: number[];
  page?: Page;
  testBaseUrl?: string;
  applySelectors: boolean;
  wantsNativeSnapshots: boolean;
  diagnostics: ImproveDiagnostic[];
}): Promise<SelectorPassResult> {
  const runtimeRegenerationDisabled = isPlaywrightRuntimeRegenerationDisabled();
  const result: SelectorPassResult = {
    outputSteps: [...input.steps],
    findings: [],
    nativeStepSnapshots: [],
    failedStepIndexes: [],
    runtimeObservedUrls: [],
    selectorRepairCandidates: 0,
    selectorRepairsApplied: 0,
    selectorRepairsAdoptedOnTie: 0,
    selectorRepairsGeneratedByPlaywrightRuntime: 0,
    selectorRepairsAppliedFromPlaywrightRuntime: 0,
  };

  for (let index = 0; index < result.outputSteps.length; index += 1) {
    const step = result.outputSteps[index];
    if (!step) continue;

    const originalIndex = input.outputStepOriginalIndexes[index] ?? index;

    if (step.action !== "navigate" && "target" in step && step.target) {
      const metrics = await processSelectorStep({
        step: step as Step & { target: Target },
        stepIndex: index,
        originalIndex,
        applySelectors: input.applySelectors,
        runtimeRegenerationDisabled,
        outputSteps: result.outputSteps,
        findings: result.findings,
        diagnostics: input.diagnostics,
        ...(input.page !== undefined ? { page: input.page } : {}),
      });
      applySelectorMetrics(result, metrics);
    }

    if (!input.page) {
      continue;
    }

    const runtimeStep = result.outputSteps[index] ?? step;
    const runtimeResult = await processRuntimeStep({
      page: input.page,
      step,
      runtimeStep,
      originalIndex,
      wantsNativeSnapshots: input.wantsNativeSnapshots,
      ...(input.testBaseUrl !== undefined ? { testBaseUrl: input.testBaseUrl } : {}),
      diagnostics: input.diagnostics,
    });
    if (runtimeResult.failed) {
      result.failedStepIndexes.push(index);
    }
    if (runtimeResult.observedUrl) {
      result.runtimeObservedUrls.push(runtimeResult.observedUrl);
    }
    if (runtimeResult.snapshot) {
      result.nativeStepSnapshots.push(runtimeResult.snapshot);
    }
  }

  return result;
}
