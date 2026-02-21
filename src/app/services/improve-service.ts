import path from "node:path";
import { confirm } from "@inquirer/prompts";
import { improveTestFile } from "../../core/improve/improve.js";
import { resolveImproveProfile } from "../options/improve-profile.js";
import { formatImproveProfileSummary } from "../options/profile-summary.js";
import { ui } from "../../utils/ui.js";
import {
  buildExternalCliInvocationWarning,
  collectAssertionSkipDetails,
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "./improve-output.js";

export interface ImproveCliOptions {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  assertionPolicy?: string;
  report?: string;
}

export async function runImprove(
  testFile: string,
  opts: ImproveCliOptions
): Promise<void> {
  const invocationWarning = buildExternalCliInvocationWarning(
    process.cwd(),
    process.argv[1],
    testFile
  );
  if (invocationWarning) {
    ui.warn(invocationWarning);
  }

  let apply = opts.apply;
  if (apply === undefined) {
    apply = await confirm({
      message: "Apply improvements to " + path.basename(testFile) + "?",
      default: true,
    });
  }
  const profile = resolveImproveProfile({ ...opts, apply });

  ui.info(
    formatImproveProfileSummary({
      applySelectors: profile.applySelectors,
      applyAssertions: profile.applyAssertions,
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
      assertionPolicy: profile.assertionPolicy,
    })
  );

  const improveOptions = {
    testFile,
    applySelectors: profile.applySelectors,
    applyAssertions: profile.applyAssertions,
    assertions: profile.assertions,
    assertionSource: profile.assertionSource,
    assertionPolicy: profile.assertionPolicy,
  };

  const result = await improveTestFile(
    profile.reportPath === undefined
      ? improveOptions
      : { ...improveOptions, reportPath: profile.reportPath }
  );

  ui.success(`Improve report saved to ${result.reportPath}`);
  if (result.outputPath) {
    ui.success(`Applied improvements to ${result.outputPath}`);
  }

  const runtimeFailingStepsRetained =
    result.report.summary.runtimeFailingStepsRetained ??
    result.report.summary.runtimeFailingStepsOptionalized ??
    0;
  const assertionCoverageStepsTotal =
    result.report.summary.assertionCoverageStepsTotal ?? 0;
  const assertionCoverageStepsWithCandidates =
    result.report.summary.assertionCoverageStepsWithCandidates ?? 0;
  const assertionCoverageStepsWithApplied =
    result.report.summary.assertionCoverageStepsWithApplied ?? 0;
  const assertionCoverageCandidateRate =
    result.report.summary.assertionCoverageCandidateRate ?? 0;
  const assertionCoverageAppliedRate =
    result.report.summary.assertionCoverageAppliedRate ?? 0;
  const assertionInventoryStepsEvaluated =
    result.report.summary.assertionInventoryStepsEvaluated ?? 0;
  const assertionInventoryCandidatesAdded =
    result.report.summary.assertionInventoryCandidatesAdded ?? 0;
  const assertionInventoryGapStepsFilled =
    result.report.summary.assertionInventoryGapStepsFilled ?? 0;
  const assertionFallbackApplied =
    result.report.summary.assertionFallbackApplied ?? 0;
  const assertionFallbackAppliedOnlySteps =
    result.report.summary.assertionFallbackAppliedOnlySteps ?? 0;
  const assertionFallbackAppliedWithNonFallbackSteps =
    result.report.summary.assertionFallbackAppliedWithNonFallbackSteps ?? 0;

  ui.info(
    `Summary: improved=${result.report.summary.improved}, unchanged=${result.report.summary.unchanged}, fallback=${result.report.summary.fallback}, warnings=${result.report.summary.warnings}, assertionCandidates=${result.report.summary.assertionCandidates}, appliedAssertions=${result.report.summary.appliedAssertions}, skippedAssertions=${result.report.summary.skippedAssertions}, selectorRepairCandidates=${result.report.summary.selectorRepairCandidates ?? 0}, selectorRepairsApplied=${result.report.summary.selectorRepairsApplied ?? 0}, assertionCandidatesFilteredVolatile=${result.report.summary.assertionCandidatesFilteredVolatile ?? 0}, assertionCoverageStepsTotal=${assertionCoverageStepsTotal}, assertionCoverageStepsWithCandidates=${assertionCoverageStepsWithCandidates}, assertionCoverageStepsWithApplied=${assertionCoverageStepsWithApplied}, assertionCoverageCandidateRate=${assertionCoverageCandidateRate}, assertionCoverageAppliedRate=${assertionCoverageAppliedRate}, assertionFallbackApplied=${assertionFallbackApplied}, assertionFallbackAppliedOnlySteps=${assertionFallbackAppliedOnlySteps}, assertionFallbackAppliedWithNonFallbackSteps=${assertionFallbackAppliedWithNonFallbackSteps}, assertionInventoryStepsEvaluated=${assertionInventoryStepsEvaluated}, assertionInventoryCandidatesAdded=${assertionInventoryCandidatesAdded}, assertionInventoryGapStepsFilled=${assertionInventoryGapStepsFilled}, runtimeFailingStepsRetained=${runtimeFailingStepsRetained}, runtimeFailingStepsRemoved=${result.report.summary.runtimeFailingStepsRemoved ?? 0}`
  );
  const assertionStatusSummary = formatAssertionApplyStatusCounts(result.report.assertionCandidates);
  if (assertionStatusSummary) {
    ui.info(`Assertion apply status: ${assertionStatusSummary}`);
  }
  const assertionSourceSummary = formatAssertionSourceCounts(result.report.assertionCandidates);
  if (assertionSourceSummary) {
    ui.info(`Assertion sources: ${assertionSourceSummary}`);
  }
  const skippedDetails = collectAssertionSkipDetails(result.report.assertionCandidates, 3);
  for (const detail of skippedDetails.details) {
    ui.step(`Skip detail: ${detail}`);
  }
  if (skippedDetails.remaining > 0) {
    ui.step(`... ${skippedDetails.remaining} more skipped assertion candidate(s) in report`);
  }

  ui.step("Review report: " + result.reportPath);
  if (!result.outputPath && opts.apply === false) {
    ui.step("Apply improvements: ui-test improve " + path.resolve(testFile) + " --apply");
  }
}
