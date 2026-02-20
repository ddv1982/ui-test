import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { stepsToYaml, yamlToTest } from "../transform/yaml-io.js";
import { testSchema, type Step } from "../yaml-schema.js";
import { ValidationError } from "../../utils/errors.js";
import { chromiumNotInstalledError, isLikelyMissingBrowser } from "../../utils/chromium-runtime.js";
import { installCookieBannerDismisser } from "../runtime/cookie-banner.js";
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
  improveReportSchema,
  type AssertionCandidate,
  type ImproveDiagnostic,
  type ImproveReport,
} from "./report-schema.js";

const ASSERTION_COVERAGE_ACTIONS = new Set<Step["action"]>([
  "click",
  "press",
  "hover",
  "fill",
  "select",
  "check",
  "uncheck",
]);

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

    const selectorPass = await runImproveSelectorPass({
      steps: initialOutputSteps,
      outputStepOriginalIndexes,
      page,
      testBaseUrl: test.baseUrl,
      applySelectors: effectiveOptions.applySelectors,
      wantsNativeSnapshots,
      diagnostics,
    });

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

    const assertionPass = await runImproveAssertionPass({
      assertions: effectiveOptions.assertions,
      assertionSource,
      assertionPolicy,
      applyAssertions: effectiveOptions.applyAssertions,
      page,
      outputSteps: postRemovalOutputSteps,
      findings: postRemovalFindings,
      outputStepOriginalIndexes: postRemovalOriginalIndexes,
      nativeStepSnapshots: postRemovalSnapshots,
      testBaseUrl: test.baseUrl,
      diagnostics,
    });
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
        runtimeFailingStepsRetained: failedIndexesToRetain.size,
        runtimeFailingStepsOptionalized: failedIndexesToRetain.size,
        runtimeFailingStepsRemoved: failedIndexesToRemove.size,
        assertionCandidatesFilteredVolatile:
          assertionPass.filteredVolatileCandidates ?? 0,
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
      const yamlOut = stepsToYaml(test.name, assertionPass.outputSteps, {
        description: test.description,
        baseUrl: test.baseUrl,
      });
      await fs.writeFile(absoluteTestPath, yamlOut, "utf-8");
      outputPath = absoluteTestPath;
    }

    return {
      report: validatedReport,
      reportPath,
      outputPath,
    };
  } finally {
    await browser.close();
  }
}

function buildAssertionCoverageSummary(
  steps: Step[],
  originalStepIndexes: number[],
  candidates: AssertionCandidate[]
): {
  total: number;
  withCandidates: number;
  withApplied: number;
  candidateRate: number;
  appliedRate: number;
} {
  const coverageStepIndexes = new Set<number>();
  for (let runtimeIndex = 0; runtimeIndex < steps.length; runtimeIndex += 1) {
    const step = steps[runtimeIndex];
    if (!step || !ASSERTION_COVERAGE_ACTIONS.has(step.action)) continue;
    const originalIndex = originalStepIndexes[runtimeIndex] ?? runtimeIndex;
    coverageStepIndexes.add(originalIndex);
  }

  const candidateStepIndexes = new Set<number>();
  const appliedStepIndexes = new Set<number>();
  for (const candidate of candidates) {
    if (!coverageStepIndexes.has(candidate.index)) continue;
    candidateStepIndexes.add(candidate.index);
    if (candidate.applyStatus === "applied") {
      appliedStepIndexes.add(candidate.index);
    }
  }

  const total = coverageStepIndexes.size;
  const withCandidates = candidateStepIndexes.size;
  const withApplied = appliedStepIndexes.size;
  return {
    total,
    withCandidates,
    withApplied,
    candidateRate: roundCoverageRate(withCandidates, total),
    appliedRate: roundCoverageRate(withApplied, total),
  };
}

function roundCoverageRate(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 1000;
}

function buildAssertionFallbackApplySummary(candidates: AssertionCandidate[]): {
  applied: number;
  appliedOnlySteps: number;
  appliedWithNonFallbackSteps: number;
} {
  const fallbackAppliedSteps = new Set<number>();
  const nonFallbackAppliedSteps = new Set<number>();
  let applied = 0;

  for (const candidate of candidates) {
    if (candidate.applyStatus !== "applied") continue;
    if (candidate.coverageFallback === true) {
      applied += 1;
      fallbackAppliedSteps.add(candidate.index);
      continue;
    }
    nonFallbackAppliedSteps.add(candidate.index);
  }

  let appliedOnlySteps = 0;
  let appliedWithNonFallbackSteps = 0;
  for (const stepIndex of fallbackAppliedSteps) {
    if (nonFallbackAppliedSteps.has(stepIndex)) {
      appliedWithNonFallbackSteps += 1;
      continue;
    }
    appliedOnlySteps += 1;
  }

  return {
    applied,
    appliedOnlySteps,
    appliedWithNonFallbackSteps,
  };
}

async function launchImproveBrowser(): Promise<{ browser: Browser; page: Page }> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await installCookieBannerDismisser(context);
    const page = await context.newPage();
    return { browser, page };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await browser?.close().catch(() => {});
    if (isLikelyMissingBrowser(message)) {
      throw chromiumNotInstalledError();
    }
    throw err;
  }
}
