import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { stepsToYaml, yamlToTest } from "../transformer.js";
import { testSchema, type Step, type Target } from "../yaml-schema.js";
import { UserError, ValidationError } from "../../utils/errors.js";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import {
  insertAppliedAssertions,
  selectCandidatesForApply,
  validateCandidatesAgainstRuntime,
} from "./assertion-apply.js";
import { generateTargetCandidates } from "./candidate-generator.js";
import { scoreTargetCandidates, shouldAdoptCandidate } from "./candidate-scorer.js";
import type { OllamaConfig } from "./llm/ollama-client.js";
import { rankSelectorCandidates } from "./llm/selector-ranker.js";
import { selectImproveProvider } from "./providers/provider-selector.js";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  improveReportSchema,
  type AssertionApplyStatus,
  type AssertionCandidate,
  type ImproveDiagnostic,
  type ImproveProviderUsed,
  type ImproveReport,
  type StepFinding,
} from "./report-schema.js";

export type ImproveProvider = "auto" | "playwright" | "playwright-cli";
export type ImproveAssertionsMode = "none" | "candidates";

export interface ImproveOptions {
  testFile: string;
  apply: boolean;
  applyAssertions: boolean;
  provider: ImproveProvider;
  assertions: ImproveAssertionsMode;
  llmEnabled: boolean;
  reportPath?: string;
  llmConfig: OllamaConfig;
}

export interface ImproveResult {
  report: ImproveReport;
  reportPath: string;
  outputPath?: string;
}

const DEFAULT_RUNTIME_TIMEOUT_MS = 3_000;
const DEFAULT_SCORING_TIMEOUT_MS = 1_200;
const ASSERTION_APPLY_MIN_CONFIDENCE = 0.75;

export async function improveTestFile(options: ImproveOptions): Promise<ImproveResult> {
  const absoluteTestPath = path.resolve(options.testFile);
  const rawContent = await fs.readFile(absoluteTestPath, "utf-8");
  const parsedYaml = yamlToTest(rawContent);
  const parsedTest = testSchema.safeParse(parsedYaml);

  if (!parsedTest.success) {
    const issues = parsedTest.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ValidationError(`Invalid test file: ${absoluteTestPath}`, issues);
  }

  const test = parsedTest.data;
  const diagnostics: ImproveDiagnostic[] = [];
  if (options.applyAssertions && options.assertions === "none") {
    throw new UserError(
      "Cannot apply assertion candidates when assertions mode is disabled.",
      "Use --assertions candidates with --apply-assertions, or remove --apply-assertions."
    );
  }

  const wantsWrite = options.apply || options.applyAssertions;
  const initialUrl = inferInitialUrl(test.steps, test.baseUrl);
  const providerResult = await selectImproveProvider(options.provider, initialUrl);
  diagnostics.push(...providerResult.diagnostics);

  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  } catch (err) {
    const launchMessage = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      code: "runtime_browser_unavailable",
      level: "warn",
      message: `Browser runtime analysis unavailable. Falling back to static scoring. ${launchMessage}`,
    });
    if (wantsWrite) {
      throw new UserError(
        "Cannot apply improve changes without runtime validation.",
        "Install and configure Chromium (for example: npx playwright install chromium), or run improve without --apply/--apply-assertions."
      );
    }
  }

  let outputSteps: Step[] = [...test.steps];
  const findings: StepFinding[] = [];
  let llmUsed = false;

  try {
    for (let index = 0; index < test.steps.length; index += 1) {
      const step = test.steps[index];

      if (step.action !== "navigate") {
        const candidates = generateTargetCandidates(step.target);
        const scored = await scoreTargetCandidates(page, candidates, DEFAULT_SCORING_TIMEOUT_MS);
        const current = scored.find((item) => item.candidate.source === "current") ?? scored[0];

        const ranked = await rankSelectorCandidates(scored, {
          llmEnabled: options.llmEnabled,
          llmConfig: options.llmConfig,
          action: step.action,
          currentCandidateId: current.candidate.id,
          snapshotExcerpt: providerResult.snapshotExcerpt,
        });
        llmUsed = llmUsed || ranked.llmUsed;
        diagnostics.push(...ranked.diagnostics);

        const improveOpportunity = shouldAdoptCandidate(current, ranked.selected);
        const runtimeValidatedSelection = ranked.selected.matchCount === 1;
        const adopt = improveOpportunity && (!options.apply || runtimeValidatedSelection);
        const recommendedTarget = adopt ? ranked.selected.candidate.target : step.target;
        const confidenceDelta = roundScore(ranked.selected.score - current.score);
        const reasonCodes = [...new Set([...current.reasonCodes, ...ranked.selected.reasonCodes])];

        if (options.apply && !adopt && improveOpportunity) {
          diagnostics.push({
            code: "apply_requires_runtime_unique_match",
            level: "warn",
            message: `Step ${index + 1}: skipped apply because candidate did not have a unique runtime match.`,
          });
        }

        findings.push({
          index,
          action: step.action,
          changed: adopt,
          oldTarget: step.target,
          recommendedTarget,
          oldScore: current.score,
          recommendedScore: ranked.selected.score,
          confidenceDelta,
          reasonCodes,
        });

        if (options.apply && adopt) {
          outputSteps[index] = {
            ...step,
            target: recommendedTarget,
          };
        }
      }

      if (page) {
        try {
          await executeRuntimeStep(page, outputSteps[index] ?? step, {
            timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
            baseUrl: test.baseUrl,
            mode: "analysis",
          });
        } catch (err) {
          diagnostics.push({
            code: "runtime_step_execution_failed",
            level: "warn",
            message:
              err instanceof Error
                ? `Runtime execution failed at step ${index + 1}; continuing with best-effort analysis. ${err.message}`
                : `Runtime execution failed at step ${index + 1}; continuing with best-effort analysis.`,
          });
        }
      }
    }

    const rawAssertionCandidates =
      options.assertions === "candidates" ? buildAssertionCandidates(outputSteps, findings) : [];
    let assertionCandidates: AssertionCandidate[] = rawAssertionCandidates.map((candidate) => ({
      ...candidate,
      applyStatus: "not_requested" as const,
    }));
    let appliedAssertions = 0;
    let skippedAssertions = 0;

    if (options.applyAssertions && page) {
      const selection = selectCandidatesForApply(rawAssertionCandidates, ASSERTION_APPLY_MIN_CONFIDENCE);
      const outcomes = await validateCandidatesAgainstRuntime(page, outputSteps, selection.selected, {
        timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
        baseUrl: test.baseUrl,
      });
      const outcomeByCandidate = new Map<
        number,
        {
          applyStatus: AssertionApplyStatus;
          applyMessage?: string;
        }
      >();

      for (const outcome of selection.skippedLowConfidence) {
        outcomeByCandidate.set(outcome.candidateIndex, {
          applyStatus: outcome.applyStatus,
          applyMessage: outcome.applyMessage,
        });
        skippedAssertions += 1;
      }

      for (const outcome of outcomes) {
        outcomeByCandidate.set(outcome.candidateIndex, {
          applyStatus: outcome.applyStatus,
          applyMessage: outcome.applyMessage,
        });
        if (outcome.applyStatus === "applied") {
          appliedAssertions += 1;
          continue;
        }

        skippedAssertions += 1;
        if (outcome.applyStatus === "skipped_runtime_failure") {
          diagnostics.push({
            code: "assertion_apply_runtime_failure",
            level: "warn",
            message: `Assertion candidate ${outcome.candidateIndex + 1} skipped: ${outcome.applyMessage ?? "runtime validation failed"}`,
          });
        }
      }

      const appliedInsertions = outcomes
        .filter((outcome) => outcome.applyStatus === "applied")
        .map((outcome) => {
          const candidate = rawAssertionCandidates[outcome.candidateIndex];
          if (!candidate) {
            throw new UserError("Assertion candidate index was out of range during apply.");
          }
          return {
            sourceIndex: candidate.index,
            assertionStep: candidate.candidate,
          };
        });

      outputSteps = insertAppliedAssertions(outputSteps, appliedInsertions);
      assertionCandidates = rawAssertionCandidates.map((candidate, candidateIndex) => {
        const outcome = outcomeByCandidate.get(candidateIndex);
        if (!outcome) {
          return {
            ...candidate,
            applyStatus: "not_requested" as const,
          };
        }
        return {
          ...candidate,
          applyStatus: outcome.applyStatus,
          ...(outcome.applyMessage ? { applyMessage: outcome.applyMessage } : {}),
        };
      });
    }

    const report: ImproveReport = {
      testFile: absoluteTestPath,
      generatedAt: new Date().toISOString(),
      providerUsed: effectiveProvider(providerResult.providerUsed, page),
      llmUsed,
      summary: {
        unchanged: findings.filter((item) => !item.changed).length,
        improved: findings.filter((item) => item.changed).length,
        fallback: findings.filter((item) => isFallbackTarget(item.recommendedTarget)).length,
        warnings: diagnostics.filter((item) => item.level !== "info").length,
        assertionCandidates: assertionCandidates.length,
        appliedAssertions,
        skippedAssertions,
      },
      stepFindings: findings,
      assertionCandidates,
      diagnostics,
    };

    const validatedReport = improveReportSchema.parse(report);
    const reportPath = options.reportPath
      ? path.resolve(options.reportPath)
      : defaultReportPath(absoluteTestPath);

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(validatedReport, null, 2), "utf-8");

    let outputPath: string | undefined;
    if (wantsWrite) {
      const yamlOut = stepsToYaml(test.name, outputSteps, {
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
    await browser?.close();
  }
}

function inferInitialUrl(steps: Step[], baseUrl?: string): string | undefined {
  const firstNavigate = steps.find((step): step is Extract<Step, { action: "navigate" }> => {
    return step.action === "navigate";
  });
  if (!firstNavigate) return baseUrl;

  const value = firstNavigate.url.trim();
  if (!value) return baseUrl;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!baseUrl) return undefined;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function isFallbackTarget(target: Target): boolean {
  return target.kind === "css" || target.kind === "xpath" || target.kind === "internal" || target.kind === "unknown";
}

function defaultReportPath(testPath: string): string {
  const ext = path.extname(testPath);
  const base = ext ? testPath.slice(0, -ext.length) : testPath;
  return `${base}.improve-report.json`;
}

function effectiveProvider(providerUsed: ImproveProviderUsed, page: Page | undefined): ImproveProviderUsed {
  if (page) return providerUsed === "none" ? "playwright" : providerUsed;
  return providerUsed;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
