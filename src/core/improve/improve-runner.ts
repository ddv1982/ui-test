import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { stepsToYaml, yamlToTest } from "../transform/yaml-io.js";
import { testSchema, type Step } from "../yaml-schema.js";
import { ValidationError } from "../../utils/errors.js";
import { chromiumNotInstalledError, isLikelyMissingChromium } from "../../utils/chromium-runtime.js";
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
  type ImproveAssertionSource,
  type ImproveOptions,
  type ImproveResult,
} from "./improve-types.js";
import {
  improveReportSchema,
  type ImproveDiagnostic,
  type ImproveReport,
} from "./report-schema.js";

export async function improveTestFile(options: ImproveOptions): Promise<ImproveResult> {
  const assertionSource: ImproveAssertionSource = options.assertionSource ?? "snapshot-native";
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

    const assertionPass = await runImproveAssertionPass({
      assertions: effectiveOptions.assertions,
      assertionSource,
      applyAssertions: effectiveOptions.applyAssertions,
      page,
      outputSteps: selectorPass.outputSteps,
      findings: selectorPass.findings,
      outputStepOriginalIndexes,
      nativeStepSnapshots: selectorPass.nativeStepSnapshots,
      testBaseUrl: test.baseUrl,
      diagnostics,
    });

    const report: ImproveReport = {
      testFile: absoluteTestPath,
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      summary: {
        unchanged: selectorPass.findings.filter((item) => !item.changed).length,
        improved: selectorPass.findings.filter((item) => item.changed).length,
        fallback: selectorPass.findings.filter((item) => isFallbackTarget(item.recommendedTarget))
          .length,
        warnings: diagnostics.filter((item) => item.level !== "info").length,
        assertionCandidates: assertionPass.assertionCandidates.length,
        appliedAssertions: assertionPass.appliedAssertions,
        skippedAssertions: assertionPass.skippedAssertions,
        assertionApplyPolicy: "reliable",
        assertionApplyStatusCounts: buildAssertionApplyStatusCounts(
          assertionPass.assertionCandidates
        ),
        assertionCandidateSourceCounts: buildAssertionCandidateSourceCounts(
          assertionPass.assertionCandidates
        ),
      },
      stepFindings: selectorPass.findings,
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

async function launchImproveBrowser(): Promise<{ browser: Browser; page: Page }> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    return { browser, page };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await browser?.close().catch(() => {});
    if (isLikelyMissingChromium(message)) {
      throw chromiumNotInstalledError();
    }
    throw err;
  }
}
