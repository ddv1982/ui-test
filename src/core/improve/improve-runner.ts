import fs from "node:fs/promises";
import path from "node:path";
import { stepsToYaml, yamlToTest } from "../transform/yaml-io.js";
import { testSchema, type Step } from "../yaml-schema.js";
import { ValidationError } from "../../utils/errors.js";
import { findStaleAssertions, removeStaleAssertions } from "./assertion-cleanup.js";
import {
  buildAssertionApplyStatusCounts,
  buildAssertionCandidateSourceCounts,
  buildOutputStepOriginalIndexes,
  defaultReportPath,
  isFallbackTarget,
} from "./improve-helpers.js";
import { runImproveAssertionPass } from "./improve-assertion-pass.js";
import { runImproveSelectorPass } from "./improve-selector-pass.js";
import {
  type ImproveAssertionPolicy,
  type ImproveAssertionSource,
  type ImproveAppliedBy,
  type ImproveOptions,
  type ImproveResult,
} from "./improve-types.js";
import { DEFAULT_IMPROVE_ASSERTION_POLICY } from "./assertion-policy.js";
import {
  buildAssertionCoverageSummary,
  buildAssertionFallbackApplySummary,
} from "./improve-runner-metrics.js";
import { launchImproveBrowser } from "./improve-browser.js";
import {
  appendDeterminismDiagnostics,
  appendDeterminismSuppressionDiagnostic,
  applyDeterminismGuardToSelectorPass,
  applyFailedStepRemovals,
  buildTestDocument,
  buildYamlOptionsFromTest,
  resolveImproveDeterminismCapabilities,
  resolveImproveExecutionPlan,
  resolveRuntimeFailingSteps,
} from "./improve-runner-support.js";
import {
  improveReportSchema,
  type ImproveDiagnostic,
  type ImproveReport,
} from "./report-schema.js";

export async function improveTestFile(options: ImproveOptions): Promise<ImproveResult> {
  const assertionSource: ImproveAssertionSource = options.assertionSource ?? "snapshot-native";
  const assertionPolicy: ImproveAssertionPolicy =
    options.assertionPolicy ?? DEFAULT_IMPROVE_ASSERTION_POLICY;
  const absoluteTestPath = path.resolve(options.testFile);
  const rawContent = await fs.readFile(absoluteTestPath, "utf-8");
  const parsedYaml = yamlToTest(rawContent);
  const parsedTest = testSchema.safeParse(parsedYaml);

  if (!parsedTest.success) {
    const issues = parsedTest.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    throw new ValidationError(`Invalid test file: ${absoluteTestPath}`, issues);
  }

  const test = parsedTest.data;
  const diagnostics: ImproveDiagnostic[] = [];
  let effectiveOptions = options;
  const dryRunWrite = options.dryRunWrite === true;
  const appliedBy: ImproveAppliedBy =
    options.appliedBy ??
    (dryRunWrite
      ? "plan_preview"
      : options.applySelectors || options.applyAssertions
        ? "manual_apply"
        : "report_only");

  if (effectiveOptions.applyAssertions && effectiveOptions.assertions === "none") {
    diagnostics.push({
      code: "apply_assertions_disabled_by_assertions_none",
      level: "warn",
      message:
        "applyAssertions was requested but assertions mode is 'none'; downgrading to applyAssertions=false.",
      mutationType: "none",
      mutationSafety: "safe",
      appliedBy,
    });
    effectiveOptions = { ...effectiveOptions, applyAssertions: false };
  }

  const wantsWrite = effectiveOptions.applySelectors || effectiveOptions.applyAssertions;
  const staleAssertions = findStaleAssertions(test.steps);

  for (const staleAssertion of staleAssertions) {
    diagnostics.push({
      code: "stale_assertion_detected",
      level: "warn",
      message: `Step ${staleAssertion.index + 1}: detected stale assertion (${staleAssertion.reason}).`,
      mutationType: "none",
      mutationSafety: "review_required",
      evidenceRefs: ["stale_assertion_detected"],
      appliedBy,
    });
  }

  const staleAssertionIndexes = staleAssertions.map((staleAssertion) => staleAssertion.index);
  const shouldRemoveStaleAssertions = wantsWrite && staleAssertionIndexes.length > 0;

  if (shouldRemoveStaleAssertions) {
    for (const staleAssertion of staleAssertions) {
      diagnostics.push({
        code: "stale_assertion_removed",
        level: "info",
        message: `Step ${staleAssertion.index + 1}: removed stale assertion (${staleAssertion.reason}).`,
        decisionConfidence: 0.95,
        mutationType: "stale_assertion_removal",
        mutationSafety: "safe",
        evidenceRefs: ["stale_assertion_detected"],
        appliedBy,
      });
    }
  }

  const executionPlan = resolveImproveExecutionPlan({
    applySelectors: effectiveOptions.applySelectors,
    applyAssertions: effectiveOptions.applyAssertions,
    assertions: effectiveOptions.assertions,
    assertionSource,
  });

  const launched = executionPlan.needsBrowser
    ? await launchImproveBrowser()
    : undefined;
  const browser = launched?.browser;
  const page = launched?.page;

  try {
    const initialOutputSteps: Step[] = shouldRemoveStaleAssertions
      ? removeStaleAssertions(test.steps, staleAssertionIndexes)
      : [...test.steps];

    const outputStepOriginalIndexes = buildOutputStepOriginalIndexes(
      test.steps,
      staleAssertionIndexes,
      shouldRemoveStaleAssertions
    );

    const wantsNativeSnapshots = executionPlan.wantsNativeSnapshots;

    const selectorPassInput = {
      steps: initialOutputSteps,
      outputStepOriginalIndexes,
      applySelectors: effectiveOptions.applySelectors,
      wantsNativeSnapshots,
      diagnostics,
      ...(page !== undefined ? { page } : {}),
    };
    const selectorPass = await runImproveSelectorPass(
      test.baseUrl === undefined
        ? selectorPassInput
        : { ...selectorPassInput, testBaseUrl: test.baseUrl }
    );

    const suppressedMutationTypes = new Set<
      "selector_update" | "assertion_insert" | "runtime_step_removal"
    >();
    const determinismBase = resolveImproveDeterminismCapabilities({
      steps: initialOutputSteps,
      observedUrls: selectorPass.runtimeObservedUrls,
      ...(test.baseUrl !== undefined ? { baseUrl: test.baseUrl } : {}),
    });

    let selectorDiagnostics = diagnostics;
    let selectorOutputSteps = selectorPass.outputSteps;
    let selectorRepairsApplied = selectorPass.selectorRepairsApplied ?? 0;
    let selectorRepairsAdoptedOnTie = selectorPass.selectorRepairsAdoptedOnTie ?? 0;
    let selectorRepairsAppliedFromPlaywrightRuntime =
      selectorPass.selectorRepairsAppliedFromPlaywrightRuntime ?? 0;

    if (!determinismBase.allowRuntimeSelectorRepairApply) {
      const selectorGuarded = applyDeterminismGuardToSelectorPass({
        selectorPass,
        initialOutputSteps,
        outputStepOriginalIndexes,
        diagnostics,
        appliedBy,
      });
      selectorDiagnostics = selectorGuarded.diagnostics;
      selectorOutputSteps = selectorGuarded.outputSteps;
      selectorRepairsApplied = selectorGuarded.selectorRepairsApplied;
      selectorRepairsAdoptedOnTie = selectorGuarded.selectorRepairsAdoptedOnTie;
      selectorRepairsAppliedFromPlaywrightRuntime =
        selectorGuarded.selectorRepairsAppliedFromPlaywrightRuntime;
      if (selectorGuarded.suppressedRuntimeSelectorRepairs > 0) {
        suppressedMutationTypes.add("selector_update");
      }
    }

    const { failedIndexesToRemove, failedIndexesToRetain } = resolveRuntimeFailingSteps({
      wantsWrite,
      allowRuntimeDerivedApply: determinismBase.allowRuntimeDerivedApply,
      failedStepIndexes: selectorPass.failedStepIndexes,
      outputSteps: selectorOutputSteps,
      outputStepOriginalIndexes,
      diagnostics: selectorDiagnostics,
      appliedBy,
    });
    if (!determinismBase.allowRuntimeDerivedApply && failedIndexesToRetain.size > 0) {
      suppressedMutationTypes.add("runtime_step_removal");
    }

    const postRemovalState = applyFailedStepRemovals({
      wantsWrite,
      failedIndexesToRemove,
      outputSteps: selectorOutputSteps,
      outputStepOriginalIndexes,
      nativeStepSnapshots: selectorPass.nativeStepSnapshots,
      findings: selectorPass.findings,
    });

    const assertionPassInput = {
      assertions: effectiveOptions.assertions,
      assertionSource,
      assertionPolicy,
      applyAssertions: effectiveOptions.applyAssertions,
      allowRuntimeAssertionApply: determinismBase.allowRuntimeAssertionApply,
      outputSteps: postRemovalState.outputSteps,
      findings: postRemovalState.findings,
      outputStepOriginalIndexes: postRemovalState.outputStepOriginalIndexes,
      nativeStepSnapshots: postRemovalState.nativeStepSnapshots,
      diagnostics: selectorDiagnostics,
      ...(page !== undefined ? { page } : {}),
    };
    const assertionPass = await runImproveAssertionPass(
      test.baseUrl === undefined
        ? assertionPassInput
        : { ...assertionPassInput, testBaseUrl: test.baseUrl }
    );
    if (
      !determinismBase.allowRuntimeAssertionApply &&
      effectiveOptions.applyAssertions &&
      assertionPass.assertionCandidates.some(
        (candidate) => candidate.candidateSource === "snapshot_native"
      )
    ) {
      suppressedMutationTypes.add("assertion_insert");
    }
    const determinism = resolveImproveDeterminismCapabilities({
      steps: initialOutputSteps,
      observedUrls: selectorPass.runtimeObservedUrls,
      suppressedMutationTypes: [...suppressedMutationTypes],
      ...(test.baseUrl !== undefined ? { baseUrl: test.baseUrl } : {}),
    });
    if (determinism.emitDeterminismDiagnostics) {
      appendDeterminismDiagnostics({
        diagnostics: selectorDiagnostics,
        determinism: determinism.determinism,
        appliedBy,
      });
      for (const mutationType of determinism.determinism.suppressedMutationTypes ?? []) {
        appendDeterminismSuppressionDiagnostic({
          diagnostics: selectorDiagnostics,
          mutationType,
          appliedBy,
        });
      }
    }
    const assertionCoverage = buildAssertionCoverageSummary(
      postRemovalState.outputSteps,
      postRemovalState.outputStepOriginalIndexes,
      assertionPass.assertionCandidates
    );
    const assertionFallback = buildAssertionFallbackApplySummary(
      assertionPass.assertionCandidates
    );
    const outputValidationIssues: string[] = [];
    if (wantsWrite) {
      const candidateOutput = buildTestDocument(test, assertionPass.outputSteps);
      const validatedOutput = testSchema.safeParse(candidateOutput);
      if (!validatedOutput.success) {
        outputValidationIssues.push(
          ...validatedOutput.error.issues.map((issue) => {
            const issuePath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
            return `${issuePath}: ${issue.message}`;
          })
        );
        selectorDiagnostics.push({
          code: "apply_write_blocked_invalid_output",
          level: "error",
          message:
            "Apply-mode output failed schema validation; YAML write was blocked to prevent an invalid test file.",
          mutationType: "none",
          mutationSafety: "safe",
          evidenceRefs: ["output_validation_failed"],
          appliedBy,
        });
      }
    }
    const reportPath = effectiveOptions.reportPath
      ? path.resolve(effectiveOptions.reportPath)
      : defaultReportPath(absoluteTestPath);

    selectorDiagnostics.push({
      code: "reproducibility_hint",
      level: "info",
      message: `Reproduce runtime behavior with: ui-test play ${absoluteTestPath}`,
      mutationType: "none",
      mutationSafety: "safe",
      evidenceRefs: ["repro:play"],
      appliedBy,
    });
    selectorDiagnostics.push({
      code: "reproducibility_hint",
      level: "info",
      message:
        `Re-run improve report with: ui-test improve ${absoluteTestPath} --no-apply --report ${reportPath}`,
      mutationType: "none",
      mutationSafety: "safe",
      evidenceRefs: ["repro:improve_report"],
      appliedBy,
    });

    const report: ImproveReport = {
      testFile: absoluteTestPath,
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      appliedBy,
      determinism: determinism.determinism,
      summary: {
        unchanged: postRemovalState.findings.filter((item) => !item.changed).length,
        improved: postRemovalState.findings.filter((item) => item.changed).length,
        fallback: postRemovalState.findings.filter((item) =>
          isFallbackTarget(item.recommendedTarget)
        ).length,
        warnings: selectorDiagnostics.filter((item) => item.level !== "info").length,
        assertionCandidates: assertionPass.assertionCandidates.length,
        appliedAssertions: assertionPass.appliedAssertions,
        skippedAssertions: assertionPass.skippedAssertions,
        selectorRepairCandidates: selectorPass.selectorRepairCandidates ?? 0,
        selectorRepairsApplied: selectorRepairsApplied,
        selectorRepairsAdoptedOnTie: selectorRepairsAdoptedOnTie,
        selectorRepairsGeneratedByPlaywrightRuntime:
          selectorPass.selectorRepairsGeneratedByPlaywrightRuntime ?? 0,
        selectorRepairsAppliedFromPlaywrightRuntime: selectorRepairsAppliedFromPlaywrightRuntime,
        deterministicAssertionsSkippedNavigationLikeClick:
          assertionPass.deterministicAssertionsSkippedNavigationLikeClick ?? 0,
        runtimeFailingStepsRetained: failedIndexesToRetain.size,
        runtimeFailingStepsRemoved: failedIndexesToRemove.size,
        assertionCandidatesFilteredDynamic:
          assertionPass.filteredDynamicCandidates ?? 0,
        assertionCoverageStepsTotal: assertionCoverage.total,
        assertionCoverageStepsWithCandidates: assertionCoverage.withCandidates,
        assertionCoverageStepsWithApplied: assertionCoverage.withApplied,
        assertionCoverageCandidateRate: assertionCoverage.candidateRate,
        assertionCoverageAppliedRate: assertionCoverage.appliedRate,
        assertionFallbackApplied: assertionFallback.applied,
        assertionFallbackAppliedOnlySteps: assertionFallback.appliedOnlySteps,
        assertionFallbackAppliedWithNonFallbackSteps:
          assertionFallback.appliedWithNonFallbackSteps,
        assertionInventoryStepsEvaluated:
          assertionPass.inventoryStepsEvaluated ?? 0,
        assertionInventoryCandidatesAdded:
          assertionPass.inventoryCandidatesAdded ?? 0,
        assertionInventoryGapStepsFilled:
          assertionPass.inventoryGapStepsFilled ?? 0,
        assertionApplyPolicy: assertionPolicy,
        assertionApplyStatusCounts: buildAssertionApplyStatusCounts(
          assertionPass.assertionCandidates
        ),
        assertionCandidateSourceCounts: buildAssertionCandidateSourceCounts(
          assertionPass.assertionCandidates
        ),
      },
      stepFindings: postRemovalState.findings,
      assertionCandidates: assertionPass.assertionCandidates,
      diagnostics: selectorDiagnostics,
    };

    const validatedReport = improveReportSchema.parse(report);

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(validatedReport, null, 2), "utf-8");

    if (outputValidationIssues.length > 0) {
      throw new ValidationError(
        `Improve apply aborted: generated output is invalid and was not written (${absoluteTestPath}).`,
        outputValidationIssues
      );
    }

    let outputPath: string | undefined;
    if (wantsWrite && !dryRunWrite) {
      const absoluteOutputPath = effectiveOptions.outputPath
        ? path.resolve(effectiveOptions.outputPath)
        : absoluteTestPath;
      const yamlOptions = buildYamlOptionsFromTest(test);
      const yamlOut = stepsToYaml(test.name, assertionPass.outputSteps, yamlOptions);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
      await fs.writeFile(absoluteOutputPath, yamlOut, "utf-8");
      outputPath = absoluteOutputPath;
    }

    const improveResult: ImproveResult = {
      report: validatedReport,
      reportPath,
    };
    if (outputPath !== undefined) {
      improveResult.outputPath = outputPath;
    }
    if (options.includeProposedTest) {
      improveResult.proposedTest = buildTestDocument(test, assertionPass.outputSteps);
    }
    return improveResult;
  } finally {
    await browser?.close();
  }
}
