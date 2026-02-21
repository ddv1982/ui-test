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
import { classifyRuntimeFailingStep } from "./runtime-failure-classifier.js";
import {
  type ImproveAssertionPolicy,
  type ImproveAssertionSource,
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

  if (effectiveOptions.applyAssertions && effectiveOptions.assertions === "none") {
    diagnostics.push({
      code: "apply_assertions_disabled_by_assertions_none",
      level: "warn",
      message:
        "applyAssertions was requested but assertions mode is 'none'; downgrading to applyAssertions=false.",
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
      });
    }
  }

  const launched = await launchImproveBrowser();
  const browser = launched.browser;
  const page = launched.page;

  try {
    const initialOutputSteps: Step[] = shouldRemoveStaleAssertions
      ? removeStaleAssertions(test.steps, staleAssertionIndexes)
      : [...test.steps];

    const outputStepOriginalIndexes = buildOutputStepOriginalIndexes(
      test.steps,
      staleAssertionIndexes,
      shouldRemoveStaleAssertions
    );

    const wantsNativeSnapshots =
      effectiveOptions.assertions === "candidates" && assertionSource === "snapshot-native";

    const selectorPassInput = {
      steps: initialOutputSteps,
      outputStepOriginalIndexes,
      page,
      applySelectors: effectiveOptions.applySelectors,
      wantsNativeSnapshots,
      diagnostics,
    };
    const selectorPass = await runImproveSelectorPass(
      test.baseUrl === undefined
        ? selectorPassInput
        : { ...selectorPassInput, testBaseUrl: test.baseUrl }
    );

    const failedIndexesToRemove = new Set<number>();
    const failedIndexesToRetain = new Set<number>();
    if (wantsWrite) {
      for (const index of selectorPass.failedStepIndexes) {
        const step = selectorPass.outputSteps[index];
        if (!step || step.action === "navigate") continue;

        const classification = classifyRuntimeFailingStep(step);
        const originalIndex = outputStepOriginalIndexes[index] ?? index;
        if (classification.disposition === "remove") {
          failedIndexesToRemove.add(index);
          diagnostics.push({
            code: "runtime_failing_step_removed",
            level: "info",
            message:
              `Step ${originalIndex + 1}: removed because it failed at runtime (${classification.reason}).`,
          });
          continue;
        }

        failedIndexesToRetain.add(index);
        diagnostics.push({
          code: "runtime_failing_step_retained",
          level: "info",
          message:
            `Step ${originalIndex + 1}: retained as required step after runtime failure (${classification.reason}).`,
        });
        diagnostics.push({
          code: "runtime_failing_step_marked_optional",
          level: "info",
          message:
            `Deprecated alias for runtime_failing_step_retained. Step ${originalIndex + 1}: retained as required step after runtime failure (${classification.reason}).`,
        });
      }
    }

    let postRemovalOutputSteps = selectorPass.outputSteps;
    let postRemovalOriginalIndexes = outputStepOriginalIndexes;
    let postRemovalSnapshots = selectorPass.nativeStepSnapshots;

    if (wantsWrite) {
      if (failedIndexesToRemove.size > 0) {
        // Splice steps in reverse order to preserve earlier indexes
        const sortedRemoveIndexes = [...failedIndexesToRemove].sort((a, b) => b - a);
        postRemovalOutputSteps = [...selectorPass.outputSteps];
        for (const idx of sortedRemoveIndexes) {
          postRemovalOutputSteps.splice(idx, 1);
        }

        // Rebuild original-index mapping
        postRemovalOriginalIndexes = outputStepOriginalIndexes.filter(
          (_, i) => !failedIndexesToRemove.has(i)
        );

        // Remap snapshot indexes
        postRemovalSnapshots = selectorPass.nativeStepSnapshots
          .filter((s) => !failedIndexesToRemove.has(s.index))
          .map((s) => {
            const offset = [...failedIndexesToRemove].filter((r) => r < s.index).length;
            return { ...s, index: s.index - offset };
          });
      }
    }

    const removedOriginalIndexes = new Set(
      [...failedIndexesToRemove].map((i) => outputStepOriginalIndexes[i] ?? i)
    );
    const postRemovalFindings =
      wantsWrite && removedOriginalIndexes.size > 0
        ? selectorPass.findings.filter((f) => !removedOriginalIndexes.has(f.index))
        : selectorPass.findings;

    const assertionPassInput = {
      assertions: effectiveOptions.assertions,
      assertionSource,
      assertionPolicy,
      applyAssertions: effectiveOptions.applyAssertions,
      page,
      outputSteps: postRemovalOutputSteps,
      findings: postRemovalFindings,
      outputStepOriginalIndexes: postRemovalOriginalIndexes,
      nativeStepSnapshots: postRemovalSnapshots,
      diagnostics,
    };
    const assertionPass = await runImproveAssertionPass(
      test.baseUrl === undefined
        ? assertionPassInput
        : { ...assertionPassInput, testBaseUrl: test.baseUrl }
    );
    const assertionCoverage = buildAssertionCoverageSummary(
      postRemovalOutputSteps,
      postRemovalOriginalIndexes,
      assertionPass.assertionCandidates
    );
    const assertionFallback = buildAssertionFallbackApplySummary(
      assertionPass.assertionCandidates
    );

    const report: ImproveReport = {
      testFile: absoluteTestPath,
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      summary: {
        unchanged: postRemovalFindings.filter((item) => !item.changed).length,
        improved: postRemovalFindings.filter((item) => item.changed).length,
        fallback: postRemovalFindings.filter((item) => isFallbackTarget(item.recommendedTarget))
          .length,
        warnings: diagnostics.filter((item) => item.level !== "info").length,
        assertionCandidates: assertionPass.assertionCandidates.length,
        appliedAssertions: assertionPass.appliedAssertions,
        skippedAssertions: assertionPass.skippedAssertions,
        selectorRepairCandidates: selectorPass.selectorRepairCandidates ?? 0,
        selectorRepairsApplied: selectorPass.selectorRepairsApplied ?? 0,
        selectorRepairsAdoptedOnTie:
          selectorPass.selectorRepairsAdoptedOnTie ?? 0,
        selectorRepairsGeneratedByPlaywrightRuntime:
          selectorPass.selectorRepairsGeneratedByPlaywrightRuntime ?? 0,
        selectorRepairsAppliedFromPlaywrightRuntime:
          selectorPass.selectorRepairsAppliedFromPlaywrightRuntime ?? 0,
        selectorRepairsGeneratedByPrivateFallback:
          selectorPass.selectorRepairsGeneratedByPrivateFallback ?? 0,
        selectorRepairsAppliedFromPrivateFallback:
          selectorPass.selectorRepairsAppliedFromPrivateFallback ?? 0,
        deterministicAssertionsSkippedNavigationLikeClick:
          assertionPass.deterministicAssertionsSkippedNavigationLikeClick ?? 0,
        runtimeFailingStepsRetained: failedIndexesToRetain.size,
        runtimeFailingStepsOptionalized: failedIndexesToRetain.size,
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
      stepFindings: postRemovalFindings,
      assertionCandidates: assertionPass.assertionCandidates,
      diagnostics,
    };

    const validatedReport = improveReportSchema.parse(report);
    const reportPath = effectiveOptions.reportPath
      ? path.resolve(effectiveOptions.reportPath)
      : defaultReportPath(absoluteTestPath);

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(validatedReport, null, 2), "utf-8");

    let outputPath: string | undefined;
    if (wantsWrite) {
      const yamlOptions: { description?: string; baseUrl?: string } = {};
      if (test.description !== undefined) {
        yamlOptions.description = test.description;
      }
      if (test.baseUrl !== undefined) {
        yamlOptions.baseUrl = test.baseUrl;
      }
      const yamlOut = stepsToYaml(test.name, assertionPass.outputSteps, yamlOptions);
      await fs.writeFile(absoluteTestPath, yamlOut, "utf-8");
      outputPath = absoluteTestPath;
    }

    const improveResult: ImproveResult = {
      report: validatedReport,
      reportPath,
    };
    if (outputPath !== undefined) {
      improveResult.outputPath = outputPath;
    }
    return improveResult;
  } finally {
    await browser.close();
  }
}
