import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { stepsToYaml, yamlToTest } from "../transformer.js";
import { testSchema, type Step, type Target } from "../yaml-schema.js";
import { UserError, ValidationError } from "../../utils/errors.js";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import { buildSnapshotCliAssertionCandidates, type StepSnapshot } from "./assertion-candidates-snapshot-cli.js";
import { buildSnapshotNativeAssertionCandidates } from "./assertion-candidates-snapshot-native.js";
import { planAssertionCoverage } from "./assertion-coverage-planner.js";
import {
  type AssertionApplyOutcome,
  type AssertionCandidateRef,
  insertAppliedAssertions,
  selectCandidatesForApply,
  validateCandidatesAgainstRuntime,
} from "./assertion-apply.js";
import { findStaleAssertions, removeStaleAssertions } from "./assertion-cleanup.js";
import { generateTargetCandidates } from "./candidate-generator.js";
import { generateAriaTargetCandidates } from "./candidate-generator-aria.js";
import {
  scoreTargetCandidates,
  shouldAdoptCandidate,
  type TargetCandidateScore,
} from "./candidate-scorer.js";
import { collectPlaywrightCliStepSnapshots } from "./providers/playwright-cli-replay.js";
import { executeRuntimeStep } from "../runtime/step-executor.js";
import {
  waitForPostStepNetworkIdle,
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
} from "../runtime/network-idle.js";
import {
  improveReportSchema,
  type AssertionApplyStatus,
  type AssertionCandidate,
  type ImproveDiagnostic,
  type ImproveReport,
  type StepFinding,
} from "./report-schema.js";

export type ImproveAssertionsMode = "none" | "candidates";
export type ImproveAssertionSource = "deterministic" | "snapshot-cli" | "snapshot-native";

export interface ImproveOptions {
  testFile: string;
  applySelectors: boolean;
  applyAssertions: boolean;
  assertions: ImproveAssertionsMode;
  assertionSource?: ImproveAssertionSource;
  reportPath?: string;
}

export interface ImproveResult {
  report: ImproveReport;
  reportPath: string;
  outputPath?: string;
}

const DEFAULT_RUNTIME_TIMEOUT_MS = 3_000;
const DEFAULT_SCORING_TIMEOUT_MS = 1_200;
const SNAPSHOT_CLI_REPLAY_TIMEOUT_MS = 15_000;
const ASSERTION_APPLY_MIN_CONFIDENCE = 0.75;

export async function improveTestFile(options: ImproveOptions): Promise<ImproveResult> {
  const assertionSource = options.assertionSource ?? "snapshot-native";
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
    diagnostics.push({
      code: "apply_assertions_disabled_by_assertions_none",
      level: "warn",
      message:
        "applyAssertions was requested but assertions mode is 'none'; downgrading to applyAssertions=false.",
    });
    options = { ...options, applyAssertions: false };
  }

  const wantsWrite = options.applySelectors || options.applyAssertions;
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
        "Install and configure Chromium (for example: npx playwright install chromium), or run improve without apply flags (--apply, --apply-selectors, --apply-assertions)."
      );
    }
  }

  let outputSteps: Step[] = shouldRemoveStaleAssertions
    ? removeStaleAssertions(test.steps, staleAssertionIndexes)
    : [...test.steps];
  const outputStepOriginalIndexes = buildOutputStepOriginalIndexes(
    test.steps,
    staleAssertionIndexes,
    shouldRemoveStaleAssertions
  );
  const findings: StepFinding[] = [];
  const wantsNativeSnapshots =
    options.assertions === "candidates" && assertionSource === "snapshot-native";
  const nativeStepSnapshots: StepSnapshot[] = [];

  try {
    for (let index = 0; index < outputSteps.length; index += 1) {
      const step = outputSteps[index];
      if (!step) continue;
      const originalIndex = outputStepOriginalIndexes[index] ?? index;

      if (step.action !== "navigate") {
        const candidates = generateTargetCandidates(step.target);

        if (page) {
          const existingValues = new Set(candidates.map((c) => c.target.value));
          const ariaResult = await generateAriaTargetCandidates(
            page,
            step.target,
            existingValues,
            DEFAULT_SCORING_TIMEOUT_MS
          );
          candidates.push(...ariaResult.candidates);
          diagnostics.push(...ariaResult.diagnostics);
        }

        const scored = await scoreTargetCandidates(page, candidates, DEFAULT_SCORING_TIMEOUT_MS);
        const current = scored.find((item) => item.candidate.source === "current") ?? scored[0];
        if (!current) {
          diagnostics.push({
            code: "candidate_scoring_unavailable",
            level: "warn",
            message: `Step ${originalIndex + 1}: no selector candidates were available for scoring.`,
          });
          continue;
        }
        const selected = chooseDeterministicSelection(scored, current);

        const improveOpportunity = shouldAdoptCandidate(current, selected);
        const runtimeValidatedSelection = selected.matchCount === 1;
        const adopt = improveOpportunity && (!options.applySelectors || runtimeValidatedSelection);
        const recommendedTarget = adopt ? selected.candidate.target : step.target;
        const confidenceDelta = roundScore(selected.score - current.score);
        const reasonCodes = [...new Set([...current.reasonCodes, ...selected.reasonCodes])];

        if (options.applySelectors && !adopt && improveOpportunity) {
          diagnostics.push({
            code: "apply_requires_runtime_unique_match",
            level: "warn",
            message: `Step ${originalIndex + 1}: skipped apply because candidate did not have a unique runtime match.`,
          });
        }

        findings.push({
          index: originalIndex,
          action: step.action,
          changed: adopt,
          oldTarget: step.target,
          recommendedTarget,
          oldScore: current.score,
          recommendedScore: selected.score,
          confidenceDelta,
          reasonCodes,
        });

        if (options.applySelectors && adopt) {
          outputSteps[index] = {
            ...step,
            target: recommendedTarget,
          };
        }
      }

      if (page) {
        let preSnapshot: string | undefined;
        if (wantsNativeSnapshots) {
          preSnapshot = await page
            .locator("body")
            .ariaSnapshot({ timeout: DEFAULT_SCORING_TIMEOUT_MS })
            .catch(() => undefined);
        }

        try {
          const runtimeStep = outputSteps[index] ?? step;
          await executeRuntimeStep(page, runtimeStep, {
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
                ? `Runtime execution failed at step ${originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
                : `Runtime execution failed at step ${originalIndex + 1}; continuing with best-effort analysis.`,
          });
        }

        if (wantsNativeSnapshots) {
          try {
            const networkIdleTimedOut = await waitForPostStepNetworkIdle(
              page,
              DEFAULT_WAIT_FOR_NETWORK_IDLE,
              DEFAULT_NETWORK_IDLE_TIMEOUT_MS
            );
            if (networkIdleTimedOut) {
              diagnostics.push({
                code: "runtime_network_idle_wait_timed_out",
                level: "warn",
                message: `Runtime network idle wait timed out at step ${originalIndex + 1}; capturing best-effort snapshot state.`,
              });
            }
          } catch (err) {
            diagnostics.push({
              code: "runtime_network_idle_wait_failed",
              level: "warn",
              message:
                err instanceof Error
                  ? `Runtime network idle wait failed at step ${originalIndex + 1}; continuing with best-effort analysis. ${err.message}`
                  : `Runtime network idle wait failed at step ${originalIndex + 1}; continuing with best-effort analysis.`,
            });
          }
        }

        if (wantsNativeSnapshots && preSnapshot !== undefined) {
          const postSnapshot = await page
            .locator("body")
            .ariaSnapshot({ timeout: DEFAULT_SCORING_TIMEOUT_MS })
            .catch(() => undefined);
          if (postSnapshot) {
            nativeStepSnapshots.push({ index, step, preSnapshot, postSnapshot });
          }
        }
      }
    }

    let rawAssertionCandidates =
      options.assertions === "candidates"
        ? buildAssertionCandidates(outputSteps, findings, outputStepOriginalIndexes)
        : [];
    let requiredCoverageCandidateIndexes = new Set<number>();
    let fallbackCoverageCandidateIndexes = new Set<number>();

    if (options.assertions === "candidates" && assertionSource === "snapshot-native") {
      if (nativeStepSnapshots.length === 0) {
        diagnostics.push({
          code: "assertion_source_snapshot_native_empty",
          level: "warn",
          message:
            "snapshot-native assertion source did not produce usable step snapshots; falling back to deterministic candidates.",
        });
      } else {
        try {
          const snapshotCandidates = buildSnapshotNativeAssertionCandidates(nativeStepSnapshots).map(
            (candidate) => ({
              ...candidate,
              index: outputStepOriginalIndexes[candidate.index] ?? candidate.index,
            })
          );
          rawAssertionCandidates = dedupeAssertionCandidates([
            ...rawAssertionCandidates,
            ...snapshotCandidates,
          ]);
        } catch (err) {
          diagnostics.push({
            code: "assertion_source_snapshot_native_parse_failed",
            level: "warn",
            message:
              err instanceof Error
                ? "Failed to parse snapshot-native assertion candidates: " + err.message
                : "Failed to parse snapshot-native assertion candidates.",
          });
          diagnostics.push({
            code: "assertion_source_snapshot_native_fallback",
            level: "warn",
            message:
              "snapshot-native assertion source failed to parse; falling back to deterministic candidates.",
          });
        }
      }
    }

    if (options.assertions === "candidates" && assertionSource === "snapshot-cli") {
      const snapshotReplay = await collectPlaywrightCliStepSnapshots({
        steps: outputSteps,
        baseUrl: test.baseUrl,
        timeoutMs: SNAPSHOT_CLI_REPLAY_TIMEOUT_MS,
      });
      diagnostics.push(...snapshotReplay.diagnostics);

      if (!snapshotReplay.available || snapshotReplay.stepSnapshots.length === 0) {
        diagnostics.push({
          code: "assertion_source_snapshot_cli_fallback",
          level: "warn",
          message:
            "snapshot-cli assertion source did not produce usable step snapshots; falling back to deterministic candidates.",
        });
      } else {
        try {
          const snapshotCandidates = buildSnapshotCliAssertionCandidates(snapshotReplay.stepSnapshots).map(
            (candidate) => ({
              ...candidate,
              index: outputStepOriginalIndexes[candidate.index] ?? candidate.index,
            })
          );
          rawAssertionCandidates = dedupeAssertionCandidates([
            ...rawAssertionCandidates,
            ...snapshotCandidates,
          ]);
        } catch (err) {
          diagnostics.push({
            code: "assertion_source_snapshot_cli_parse_failed",
            level: "warn",
            message:
              err instanceof Error
                ? `Failed to parse snapshot-cli assertion candidates: ${err.message}`
                : "Failed to parse snapshot-cli assertion candidates.",
          });
          diagnostics.push({
            code: "assertion_source_snapshot_cli_fallback",
            level: "warn",
            message:
              "snapshot-cli assertion source failed to parse; falling back to deterministic candidates.",
          });
        }
      }
    }

    if (options.assertions === "candidates") {
      const coveragePlan = planAssertionCoverage(
        outputSteps,
        outputStepOriginalIndexes,
        rawAssertionCandidates
      );
      rawAssertionCandidates = coveragePlan.candidates;
      requiredCoverageCandidateIndexes = new Set(coveragePlan.requiredCandidateIndexes);
      fallbackCoverageCandidateIndexes = new Set(coveragePlan.fallbackCandidateIndexes);

      for (const candidateIndex of coveragePlan.fallbackCandidateIndexes) {
        const candidate = rawAssertionCandidates[candidateIndex];
        if (!candidate) continue;
        diagnostics.push({
          code: "assertion_coverage_fallback_generated",
          level: "info",
          message: `Step ${candidate.index + 1}: generated fallback coverage assertion (${candidate.candidate.action}).`,
        });
      }
    }

    let assertionCandidates: AssertionCandidate[] = rawAssertionCandidates.map((candidate) => ({
      ...candidate,
      applyStatus: "not_requested" as const,
    }));
    let appliedAssertions = 0;
    let skippedAssertions = 0;

    if (options.applyAssertions && page) {
      const originalToRuntimeIndex = buildOriginalToRuntimeIndex(outputStepOriginalIndexes);
      const selection = selectCandidatesForApply(
        rawAssertionCandidates,
        ASSERTION_APPLY_MIN_CONFIDENCE,
        requiredCoverageCandidateIndexes
      );
      const runtimeSelection: AssertionCandidateRef[] = [];
      const unmappedOutcomes: AssertionApplyOutcome[] = [];
      for (const selectedCandidate of selection.selected) {
        const runtimeIndex = originalToRuntimeIndex.get(selectedCandidate.candidate.index);
        if (runtimeIndex === undefined) {
          unmappedOutcomes.push({
            candidateIndex: selectedCandidate.candidateIndex,
            applyStatus: "skipped_runtime_failure",
            applyMessage: `Candidate source step ${selectedCandidate.candidate.index + 1} could not be mapped to runtime replay index.`,
          });
          continue;
        }
        runtimeSelection.push({
          candidateIndex: selectedCandidate.candidateIndex,
          candidate: {
            ...selectedCandidate.candidate,
            index: runtimeIndex,
          },
        });
      }
      const outcomes = await validateCandidatesAgainstRuntime(page, outputSteps, runtimeSelection, {
        timeout: DEFAULT_RUNTIME_TIMEOUT_MS,
        baseUrl: test.baseUrl,
        forceApplyOnRuntimeFailureCandidateIndexes: requiredCoverageCandidateIndexes,
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

      for (const outcome of unmappedOutcomes) {
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
          if (outcome.forcedByCoverage) {
            diagnostics.push({
              code: "assertion_coverage_forced_apply_after_runtime_failure",
              level: "warn",
              message:
                outcome.applyMessage
                  ? `Assertion candidate ${outcome.candidateIndex + 1} force-applied: ${outcome.applyMessage}`
                  : `Assertion candidate ${outcome.candidateIndex + 1} force-applied after runtime validation failure.`,
            });
          }
          continue;
        }

        skippedAssertions += 1;
        if (
          outcome.applyStatus === "skipped_existing" &&
          requiredCoverageCandidateIndexes.has(outcome.candidateIndex)
        ) {
          const candidate = rawAssertionCandidates[outcome.candidateIndex];
          if (candidate) {
            diagnostics.push({
              code: "assertion_coverage_step_satisfied_by_existing_adjacent_assertion",
              level: "info",
              message: `Step ${candidate.index + 1}: coverage satisfied by existing adjacent assertion.`,
            });
          }
        }
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
          const runtimeIndex = originalToRuntimeIndex.get(candidate.index);
          if (runtimeIndex === undefined) {
            throw new UserError("Assertion candidate source index could not be mapped to runtime index during apply.");
          }
          return {
            sourceIndex: runtimeIndex,
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
            ...(fallbackCoverageCandidateIndexes.has(candidateIndex)
              ? {
                  applyMessage:
                    "Coverage fallback candidate generated for this step.",
                }
              : {}),
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
      providerUsed: page ? "playwright" : "none",
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

function isFallbackTarget(target: Target): boolean {
  return target.kind === "css" || target.kind === "xpath" || target.kind === "internal" || target.kind === "unknown";
}

function defaultReportPath(testPath: string): string {
  const ext = path.extname(testPath);
  const base = ext ? testPath.slice(0, -ext.length) : testPath;
  return `${base}.improve-report.json`;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildOriginalToRuntimeIndex(outputStepOriginalIndexes: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let runtimeIndex = 0; runtimeIndex < outputStepOriginalIndexes.length; runtimeIndex += 1) {
    const originalIndex = outputStepOriginalIndexes[runtimeIndex];
    if (originalIndex === undefined) continue;
    out.set(originalIndex, runtimeIndex);
  }
  return out;
}

function buildOutputStepOriginalIndexes(
  steps: Step[],
  staleAssertionIndexes: number[],
  removeStaleAssertions: boolean
): number[] {
  if (!removeStaleAssertions || staleAssertionIndexes.length === 0) {
    return steps.map((_, index) => index);
  }

  const staleIndexSet = new Set(staleAssertionIndexes);
  const out: number[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    if (staleIndexSet.has(index)) continue;
    out.push(index);
  }

  return out;
}

function chooseDeterministicSelection(
  scored: TargetCandidateScore[],
  fallback: TargetCandidateScore
): TargetCandidateScore {
  if (scored.length === 0) return fallback;

  let best = scored[0]!;
  for (let index = 1; index < scored.length; index += 1) {
    const candidate = scored[index];
    if (!candidate) continue;
    if (candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}

function dedupeAssertionCandidates(
  candidates: AssertionCandidate[]
): AssertionCandidate[] {
  const seen = new Set<string>();
  const out: AssertionCandidate[] = [];

  for (const candidate of candidates) {
    const key = assertionCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function assertionCandidateKey(candidate: AssertionCandidate): string {
  const candidateStep = candidate.candidate;
  const targetKey =
    candidateStep.action === "navigate"
      ? `navigate:${candidateStep.url}`
      : normalizeTargetKey(candidateStep.target);

  return [
    candidate.index,
    candidateStep.action,
    targetKey,
    "text" in candidateStep ? candidateStep.text : "",
    "value" in candidateStep ? candidateStep.value : "",
    candidateStep.action === "assertChecked"
      ? String(candidateStep.checked ?? true)
      : "",
  ].join("|");
}

function normalizeTargetKey(target: Target): string {
  const framePath = target.framePath ?? [];
  return [
    target.kind,
    target.value.trim().toLowerCase(),
    framePath.join(">"),
  ].join("|");
}
