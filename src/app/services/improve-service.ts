import fs from "node:fs/promises";
import path from "node:path";
import { confirm } from "@inquirer/prompts";
import { improveTestFile } from "../../core/improve/improve.js";
import type { ImproveAppliedBy } from "../../core/improve/improve.js";
import {
  defaultImprovePlanPath,
  hashImprovePlanSource,
  improvePlanSchema,
  type ImprovePlan,
  relativizePlanPath,
  resolvePlanPath,
  sortPlanAssertionCandidates,
  sortPlanDiagnostics,
} from "../../core/improve/improve-plan.js";
import { stepsToYaml } from "../../core/transform/yaml-io.js";
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
  formatAssertionApplyStatusCounts,
  formatAssertionSourceCounts,
} from "../../app/services/improve-output.js";

export interface ImproveCliOptions {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  assertionPolicy?: string;
  plan?: boolean;
  applyPlan?: string;
  report?: string;
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
    await generateImprovePlan(testFile, opts);
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

  ui.success(`Improve report saved to ${result.reportPath}`);
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

async function generateImprovePlan(testFile: string, opts: ImproveCliOptions): Promise<void> {
  const profile = applyImproveProfileMutations(
    resolveImproveProfile({ ...opts, apply: true })
  );
  ui.info(
    formatImproveProfileSummary({
      applySelectors: profile.applySelectors,
      applyAssertions: profile.applyAssertions,
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
      assertionPolicy: profile.assertionPolicy,
    })
  );

  const result = await improveTestFile(
    profile.reportPath === undefined
      ? {
          testFile,
          applySelectors: profile.applySelectors,
          applyAssertions: profile.applyAssertions,
          assertions: profile.assertions,
          assertionSource: profile.assertionSource,
          assertionPolicy: profile.assertionPolicy,
          dryRunWrite: true,
          includeProposedTest: true,
          appliedBy: "plan_preview",
        }
      : {
          testFile,
          applySelectors: profile.applySelectors,
          applyAssertions: profile.applyAssertions,
          assertions: profile.assertions,
          assertionSource: profile.assertionSource,
          assertionPolicy: profile.assertionPolicy,
          dryRunWrite: true,
          includeProposedTest: true,
          appliedBy: "plan_preview",
          reportPath: profile.reportPath,
        }
  );

  if (!result.proposedTest) {
    throw new UserError(
      "Improve plan generation failed: no proposed test output was returned.",
      "Retry with ui-test improve <file> --plan."
    );
  }

  const planPath = defaultImprovePlanPath(testFile);
  const absoluteTestPath = path.resolve(testFile);
  const sourceTestContent = await fs.readFile(absoluteTestPath, "utf-8");
  const plan = {
    version: 2 as const,
    generatedAt: new Date().toISOString(),
    testFile: relativizePlanPath(planPath, absoluteTestPath),
    testFileLocator: "relative_to_plan" as const,
    testFileSha256: hashImprovePlanSource(sourceTestContent),
    sourceReportPath: relativizePlanPath(planPath, result.reportPath),
    sourceReportPathLocator: "relative_to_plan" as const,
    appliedBy: "plan_preview" as const,
    profile: {
      assertions: profile.assertions,
      assertionSource: profile.assertionSource,
      assertionPolicy: profile.assertionPolicy,
      applySelectors: profile.applySelectors,
      applyAssertions: profile.applyAssertions,
    },
    summary: {
      runtimeFailingStepsRetained:
        result.report.summary.runtimeFailingStepsRetained ?? 0,
      runtimeFailingStepsRemoved:
        result.report.summary.runtimeFailingStepsRemoved ?? 0,
      skippedAssertions: result.report.summary.skippedAssertions,
    },
    diagnostics: sortPlanDiagnostics(
      result.report.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        level: diagnostic.level,
        message: diagnostic.message,
      }))
    ),
    assertionCandidates: sortPlanAssertionCandidates(result.report.assertionCandidates),
    test: {
      name: result.proposedTest.name,
      description: result.proposedTest.description,
      baseUrl: result.proposedTest.baseUrl,
      steps: result.proposedTest.steps,
    },
  };
  const validatedPlan = improvePlanSchema.parse(plan);

  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(validatedPlan, null, 2), "utf-8");

  ui.success(`Improve report saved to ${result.reportPath}`);
  ui.success(`Improve plan saved to ${planPath}`);
  ui.step(`Apply plan: ui-test improve ${absoluteTestPath} --apply-plan ${planPath}`);
}

async function applyImprovePlan(
  testFile: string,
  planPath: string,
  writeTarget: ImproveWriteTarget
): Promise<void> {
  const absoluteTestPath = path.resolve(testFile);
  const absolutePlanPath = path.resolve(planPath);

  let parsed: unknown;
  try {
    const planContent = await fs.readFile(absolutePlanPath, "utf-8");
    parsed = JSON.parse(planContent) as unknown;
  } catch {
    throw new UserError(
      `Could not read improve plan: ${absolutePlanPath}`,
      "Generate a plan first with ui-test improve <file> --plan."
    );
  }

  let plan: ImprovePlan;
  try {
    plan = improvePlanSchema.parse(parsed);
  } catch {
    throw new UserError(
      `Invalid improve plan format: ${absolutePlanPath}`,
      "Regenerate the plan with ui-test improve <file> --plan."
    );
  }

  const expectedPlanTargetPath =
    plan.version === 2
      ? resolvePlanPath(absolutePlanPath, plan.testFile, plan.testFileLocator)
      : path.resolve(plan.testFile);

  if (plan.version === 2) {
    let targetSourceContent: string;
    try {
      targetSourceContent = await fs.readFile(absoluteTestPath, "utf-8");
    } catch {
      throw new UserError(
        `Could not read target test file for plan apply: ${absoluteTestPath}`,
        "Use the matching test file path or regenerate the plan from the current file."
      );
    }

    const actualHash = hashImprovePlanSource(targetSourceContent);
    if (actualHash !== plan.testFileSha256) {
      throw new UserError(
        `Plan source mismatch: ${absoluteTestPath} no longer matches the test content used to generate ${absolutePlanPath}.`,
        "Regenerate the plan from the current test file before applying it."
      );
    }
  } else if (expectedPlanTargetPath !== absoluteTestPath) {
    throw new UserError(
      `Plan target mismatch: ${absolutePlanPath} targets ${plan.testFile}, not ${absoluteTestPath}.`,
      "Use the matching test file argument or regenerate the plan."
    );
  }

  const yamlOptions: { description?: string; baseUrl?: string } = {};
  if (plan.test.description !== undefined) {
    yamlOptions.description = plan.test.description;
  }
  if (plan.test.baseUrl !== undefined) {
    yamlOptions.baseUrl = plan.test.baseUrl;
  }

  const yamlOut = stepsToYaml(plan.test.name, plan.test.steps, yamlOptions);
  await fs.mkdir(path.dirname(writeTarget.destinationPath), { recursive: true });
  await fs.writeFile(writeTarget.destinationPath, yamlOut, "utf-8");

  ui.success(`Applied improve plan: ${absolutePlanPath}`);
  ui.success(`Updated test file: ${writeTarget.destinationPath}`);
  ui.info(
    `Plan summary: skippedAssertions=${plan.version === 2 ? plan.summary.skippedAssertions : 0}, runtimeFailingStepsRetained=${plan.version === 2 ? plan.summary.runtimeFailingStepsRetained : 0}, runtimeFailingStepsRemoved=${plan.version === 2 ? plan.summary.runtimeFailingStepsRemoved : 0}`
  );
  if (writeTarget.destinationPath !== absoluteTestPath) {
    ui.step(`Original preserved at: ${absoluteTestPath}`);
  }
  if (plan.version === 2 && expectedPlanTargetPath !== absoluteTestPath) {
    ui.warn(
      `Plan path resolved to ${expectedPlanTargetPath}, but the requested target matched by content fingerprint.`
    );
  }
}

interface ImproveWriteTarget {
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
