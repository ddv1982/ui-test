import fs from "node:fs/promises";
import path from "node:path";
import {
  improveTestFile,
  type ImproveAssertionPolicy,
  type ImproveAssertionsMode,
  type ImproveAssertionSource,
} from "../../core/improve/improve.js";
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
import { ui } from "../../utils/ui.js";
import { UserError } from "../../utils/errors.js";
import { formatImproveProfileSummary } from "../options/profile-summary.js";

interface ImprovePlanProfile {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  assertionPolicy: ImproveAssertionPolicy;
  applySelectors: boolean;
  applyAssertions: boolean;
  reportPath?: string;
}

interface ImproveWriteTarget {
  destinationPath: string;
}

export async function generateImprovePlan(
  testFile: string,
  profile: ImprovePlanProfile
): Promise<void> {
  const { applySelectors, applyAssertions, assertions, assertionSource, assertionPolicy } =
    profile;

  ui.info(
    formatImproveProfileSummary({
      applySelectors,
      applyAssertions,
      assertions,
      assertionSource,
      assertionPolicy,
    })
  );

  const result = await improveTestFile(
    profile.reportPath === undefined
      ? {
          testFile,
          applySelectors,
          applyAssertions,
          assertions,
          assertionSource,
          assertionPolicy,
          dryRunWrite: true,
          includeProposedTest: true,
          appliedBy: "plan_preview",
        }
      : {
          testFile,
          applySelectors,
          applyAssertions,
          assertions,
          assertionSource,
          assertionPolicy,
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
      assertions,
      assertionSource,
      assertionPolicy,
      applySelectors,
      applyAssertions,
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

export async function applyImprovePlan(
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
