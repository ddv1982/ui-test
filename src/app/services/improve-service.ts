import path from "node:path";
import { confirm } from "@inquirer/prompts";
import { improveTestFile } from "../../core/improve/improve.js";
import type { ImproveAppliedBy } from "../../core/improve/improve.js";
import {
  resolveImproveProfile,
  type ResolvedImproveProfile,
} from "../options/improve-profile.js";
import { formatImproveProfileSummary } from "../options/profile-summary.js";
import { ui } from "../../utils/ui.js";
import { UserError } from "../../utils/errors.js";
import {
  buildExternalCliInvocationWarning,
  collectAssertionSkipDetails,
  formatDeterminismVerdict,
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "./improve-output.js";
import {
  applyImprovePlan,
  generateImprovePlan,
} from "./improve-plan-io.js";

export interface ImproveCliOptions {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  assertionPolicy?: string;
  plan?: boolean;
  applyPlan?: string;
  report?: string;
  loadStorage?: string;
  output?: string;
  inPlace?: boolean;
}

export async function runImprove(
  testFile: string,
  opts: ImproveCliOptions
): Promise<void> {
  validateImproveModeOptions(opts);

  const invocationWarning = buildExternalCliInvocationWarning(
    process.cwd(),
    process.argv[1],
    testFile
  );
  if (invocationWarning) {
    ui.warn(invocationWarning);
  }

  if (opts.applyPlan) {
    await applyImprovePlan(
      testFile,
      opts.applyPlan,
      resolveImproveWriteTarget(testFile, opts)
    );
    return;
  }

  if (opts.plan) {
    await generateImprovePlan(
      testFile,
      applyImproveProfileMutations(resolveImproveProfile({ ...opts, apply: true }))
    );
    return;
  }

  let apply = opts.apply;
  if (apply === undefined) {
    const promptMessage = opts.inPlace
      ? `Apply improvements in-place to ${path.basename(testFile)}?`
      : `Write improved copy to ${path.basename(resolveDefaultImproveOutputPath(testFile, opts.output))}?`;
    apply = await confirm({
      message: promptMessage,
      default: true,
    });
  }
  const profile = applyImproveProfileMutations(
    resolveImproveProfile({ ...opts, apply })
  );

  if (!apply && (opts.output || opts.inPlace)) {
    throw new UserError(
      "Cannot use --output or --in-place when apply is disabled.",
      "Remove --output/--in-place or run with --apply."
    );
  }

  const wantsWrite = profile.applySelectors || profile.applyAssertions;
  const writeTarget = wantsWrite ? resolveImproveWriteTarget(testFile, opts) : undefined;

  ui.info(
    formatImproveProfileSummary({
      applySelectors: profile.applySelectors,
      applyAssertions: profile.applyAssertions,
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
      assertionPolicy: profile.assertionPolicy,
      ...(profile.loadStorage !== undefined ? { loadStorage: profile.loadStorage } : {}),
    })
  );

  const improveOptions = {
    testFile,
    ...(writeTarget?.outputPath ? { outputPath: writeTarget.outputPath } : {}),
    applySelectors: profile.applySelectors,
    applyAssertions: profile.applyAssertions,
    assertions: profile.assertions,
    assertionSource: profile.assertionSource,
    assertionPolicy: profile.assertionPolicy,
    ...(profile.loadStorage !== undefined ? { loadStorage: profile.loadStorage } : {}),
    appliedBy: (
      profile.applySelectors || profile.applyAssertions
        ? "manual_apply"
        : "report_only"
    ) as ImproveAppliedBy,
  };

  const result = await improveTestFile(
    profile.reportPath === undefined
      ? improveOptions
      : { ...improveOptions, reportPath: profile.reportPath }
  );

  const determinismVerdict = formatDeterminismVerdict(result.report.determinism);

  ui.success(`Improve report saved to ${result.reportPath}`);
  if (determinismVerdict) {
    if (determinismVerdict.level === "warn") {
      ui.warn(determinismVerdict.message);
    } else {
      ui.info(determinismVerdict.message);
    }
  }
  if (result.outputPath) {
    ui.success(`Applied improvements to ${result.outputPath}`);
    if (path.resolve(result.outputPath) !== path.resolve(testFile)) {
      ui.step(`Original preserved at: ${path.resolve(testFile)}`);
    }
  }

  const runtimeFailingStepsRetained =
    result.report.summary.runtimeFailingStepsRetained ?? 0;
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
    `Summary: improved=${result.report.summary.improved}, unchanged=${result.report.summary.unchanged}, fallback=${result.report.summary.fallback}, warnings=${result.report.summary.warnings}, assertionCandidates=${result.report.summary.assertionCandidates}, appliedAssertions=${result.report.summary.appliedAssertions}, skippedAssertions=${result.report.summary.skippedAssertions}, selectorRepairCandidates=${result.report.summary.selectorRepairCandidates ?? 0}, selectorRepairsApplied=${result.report.summary.selectorRepairsApplied ?? 0}, selectorRepairsAdoptedOnTie=${result.report.summary.selectorRepairsAdoptedOnTie ?? 0}, selectorRepairsGeneratedByPlaywrightRuntime=${result.report.summary.selectorRepairsGeneratedByPlaywrightRuntime ?? 0}, selectorRepairsAppliedFromPlaywrightRuntime=${result.report.summary.selectorRepairsAppliedFromPlaywrightRuntime ?? 0}, assertionCandidatesFilteredDynamic=${result.report.summary.assertionCandidatesFilteredDynamic ?? 0}, assertionCoverageStepsTotal=${assertionCoverageStepsTotal}, assertionCoverageStepsWithCandidates=${assertionCoverageStepsWithCandidates}, assertionCoverageStepsWithApplied=${assertionCoverageStepsWithApplied}, assertionCoverageCandidateRate=${assertionCoverageCandidateRate}, assertionCoverageAppliedRate=${assertionCoverageAppliedRate}, assertionFallbackApplied=${assertionFallbackApplied}, assertionFallbackAppliedOnlySteps=${assertionFallbackAppliedOnlySteps}, assertionFallbackAppliedWithNonFallbackSteps=${assertionFallbackAppliedWithNonFallbackSteps}, assertionInventoryStepsEvaluated=${assertionInventoryStepsEvaluated}, assertionInventoryCandidatesAdded=${assertionInventoryCandidatesAdded}, assertionInventoryGapStepsFilled=${assertionInventoryGapStepsFilled}, runtimeFailingStepsRetained=${runtimeFailingStepsRetained}, runtimeFailingStepsRemoved=${result.report.summary.runtimeFailingStepsRemoved ?? 0}`
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

function resolveDefaultImproveOutputPath(testFile: string, overridePath?: string): string {
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath.trim();
  }

  const absoluteInput = path.resolve(testFile);
  const ext = path.extname(absoluteInput);
  const base = ext ? absoluteInput.slice(0, -ext.length) : absoluteInput;
  const effectiveExt = ext.length > 0 ? ext : ".yaml";
  return `${base}.improved${effectiveExt}`;
}

export interface ImproveWriteTarget {
  destinationPath: string;
  outputPath?: string;
}

function validateImproveModeOptions(opts: ImproveCliOptions): void {
  if (opts.plan && opts.applyPlan) {
    throw new UserError(
      "Cannot use --plan together with --apply-plan.",
      "Choose one mode: --plan to generate or --apply-plan <path> to apply."
    );
  }

  if (opts.output && opts.inPlace) {
    throw new UserError(
      "Cannot combine --output with --in-place.",
      "Use --output <path> to write a copy, or --in-place to overwrite the input file."
    );
  }

  if (opts.plan && (opts.output || opts.inPlace)) {
    throw new UserError(
      "Cannot use --output or --in-place together with --plan.",
      "Plan mode generates JSON only. Apply it later with --apply-plan."
    );
  }

  if (opts.plan && opts.apply !== undefined) {
    throw new UserError(
      "Cannot use --apply or --no-apply together with --plan.",
      "Plan mode always generates a reviewable apply preview without writing YAML."
    );
  }

  if (opts.applyPlan && opts.apply === false) {
    throw new UserError(
      "Cannot use --no-apply together with --apply-plan.",
      "Remove --no-apply or use --plan to generate a reviewable plan."
    );
  }

  if (
    opts.applyPlan &&
    (opts.apply === true ||
      opts.assertions !== undefined ||
      opts.assertionSource !== undefined ||
      opts.assertionPolicy !== undefined ||
      opts.report !== undefined)
  ) {
    throw new UserError(
      "Cannot combine --apply-plan with apply/profile/report flags.",
      "The plan already defines its assertions/profile and does not generate a new report when applied."
    );
  }
}

function resolveImproveWriteTarget(
  testFile: string,
  opts: Pick<ImproveCliOptions, "output" | "inPlace">
): ImproveWriteTarget {
  const absoluteTestPath = path.resolve(testFile);
  if (opts.inPlace) {
    return { destinationPath: absoluteTestPath };
  }

  const destinationPath = path.resolve(
    resolveDefaultImproveOutputPath(testFile, opts.output)
  );
  return {
    destinationPath,
    outputPath: destinationPath,
  };
}

function applyImproveProfileMutations(
  profile: ResolvedImproveProfile
): ResolvedImproveProfile {
  if (profile.assertions === "none" && profile.applyAssertions) {
    return {
      ...profile,
      applyAssertions: false,
    };
  }

  return profile;
}
