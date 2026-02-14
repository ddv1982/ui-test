import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type BrowserContext,
  chromium,
  type Browser,
  type Page,
} from "playwright";
import { testSchema, type Step } from "./yaml-schema.js";
import { yamlToTest } from "./transformer.js";
import { ValidationError, UserError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";
import { executeRuntimeStep } from "./runtime/step-executor.js";
import {
  isPlaywrightLocator,
  resolveLocator,
  resolveLocatorContext,
  resolveNavigateUrl,
} from "./runtime/locator-runtime.js";
import {
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
  isPlaywrightTimeoutError,
  waitForPostStepNetworkIdle,
} from "./runtime/network-idle.js";
import {
  buildPlayFailureArtifactPaths,
  buildPlayFailureReport,
  createPlayRunId,
  writePlayFailureReport,
} from "./play-failure-report.js";

const NETWORK_IDLE_WARNING_LIMIT = 3;

export interface PlayOptions {
  headed?: boolean;
  timeout?: number;
  baseUrl?: string;
  delayMs?: number;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
  saveFailureArtifacts?: boolean;
  artifactsDir?: string;
  runId?: string;
}

export interface StepResult {
  step: Step;
  index: number;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface TestResult {
  name: string;
  file: string;
  steps: StepResult[];
  passed: boolean;
  durationMs: number;
  failureArtifacts?: {
    runId: string;
    testSlug: string;
    reportPath?: string;
    tracePath?: string;
    screenshotPath?: string;
  };
  artifactWarnings?: string[];
}

export async function play(
  filePath: string,
  options: PlayOptions = {}
): Promise<TestResult> {
  const absoluteFilePath = path.resolve(filePath);
  const timeout = options.timeout ?? 10_000;
  const delayMs = options.delayMs ?? 0;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;
  const networkIdleTimeout =
    options.networkIdleTimeout ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
  const saveFailureArtifacts = options.saveFailureArtifacts ?? true;
  const artifactsDir = options.artifactsDir ?? ".ui-test-artifacts";
  const runId = options.runId ?? createPlayRunId();

  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new UserError(
      `Invalid delay value: ${delayMs}`,
      "Delay must be a non-negative integer in milliseconds."
    );
  }

  if (
    !Number.isFinite(networkIdleTimeout) ||
    networkIdleTimeout <= 0 ||
    !Number.isInteger(networkIdleTimeout)
  ) {
    throw new UserError(
      `Invalid network idle timeout value: ${networkIdleTimeout}`,
      "Network idle timeout must be a positive integer in milliseconds."
    );
  }

  const content = await fs.readFile(absoluteFilePath, "utf-8");
  const raw = yamlToTest(content);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new ValidationError(
      `Invalid test file: ${absoluteFilePath}`,
      issues
    );
  }

  const test = parsed.data;
  const effectiveBaseUrl = test.baseUrl ?? options.baseUrl;
  const stepResults: StepResult[] = [];
  const testStart = Date.now();
  let networkIdleTimeoutWarnings = 0;
  const artifactWarnings: string[] = [];
  let failureArtifacts:
    | {
        runId: string;
        testSlug: string;
        reportPath?: string;
        tracePath?: string;
        screenshotPath?: string;
      }
    | undefined;
  let tracingStarted = false;
  let tracingStopped = false;

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let artifactPaths = saveFailureArtifacts
    ? buildPlayFailureArtifactPaths({
        artifactsDir,
        runId,
        testFilePath: absoluteFilePath,
      })
    : undefined;

  try {
    browser = await launchBrowser(options.headed);
    context = await browser.newContext();
    page = await context.newPage();

    if (artifactPaths) {
      try {
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
          title: test.name,
        });
        tracingStarted = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        artifactWarnings.push(`Failed to start trace capture: ${message}`);
      }
    }

    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepStart = Date.now();
      const desc = stepDescription(step, i);

      try {
        await executeRuntimeStep(page, step, {
          timeout,
          baseUrl: effectiveBaseUrl,
          mode: "playback",
        });
        const networkIdleTimedOut = await waitForPostStepNetworkIdle(
          page,
          waitForNetworkIdle,
          networkIdleTimeout
        );
        if (networkIdleTimedOut) {
          networkIdleTimeoutWarnings += 1;
          if (networkIdleTimeoutWarnings <= NETWORK_IDLE_WARNING_LIMIT) {
            ui.warn(
              `Step ${i + 1} (${step.action}): network idle not reached within ${networkIdleTimeout}ms; continuing.`
            );
          } else if (networkIdleTimeoutWarnings === NETWORK_IDLE_WARNING_LIMIT + 1) {
            ui.warn(
              "Additional network idle timeout warnings will be suppressed for this test file."
            );
          }
        }
        const result: StepResult = {
          step,
          index: i,
          passed: true,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.success(`${desc} (${result.durationMs}ms)`);

        if (delayMs > 0 && i < test.steps.length - 1) {
          await sleep(delayMs);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const result: StepResult = {
          step,
          index: i,
          passed: false,
          error: errMsg,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.error(`${desc}: ${errMsg}`);

        if (artifactPaths) {
          let canWriteArtifacts = true;
          try {
            await fs.mkdir(artifactPaths.testDir, { recursive: true });
          } catch (mkdirErr) {
            const message = mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr);
            artifactWarnings.push(`Failed to prepare failure artifact directory: ${message}`);
            canWriteArtifacts = false;
          }

          if (canWriteArtifacts) {
            let tracePath: string | undefined;
            let screenshotPath: string | undefined;
            let reportPath: string | undefined;

            if (tracingStarted) {
              try {
                await context.tracing.stop({ path: artifactPaths.tracePath });
                tracePath = artifactPaths.tracePath;
                tracingStopped = true;
              } catch (traceErr) {
                const message = traceErr instanceof Error ? traceErr.message : String(traceErr);
                artifactWarnings.push(`Failed to save trace zip: ${message}`);
              }
            }

            try {
              await page.screenshot({ path: artifactPaths.screenshotPath, fullPage: true });
              screenshotPath = artifactPaths.screenshotPath;
            } catch (screenshotErr) {
              const message = screenshotErr instanceof Error ? screenshotErr.message : String(screenshotErr);
              artifactWarnings.push(`Failed to save failure screenshot: ${message}`);
            }

            try {
              const report = buildPlayFailureReport({
                runId,
                testName: test.name,
                testFile: absoluteFilePath,
                testSlug: artifactPaths.testSlug,
                failure: {
                  stepIndex: i,
                  action: step.action,
                  error: errMsg,
                  durationMs: result.durationMs,
                },
                steps: stepResults.map((stepResult) => ({
                  index: stepResult.index,
                  action: stepResult.step.action,
                  passed: stepResult.passed,
                  error: stepResult.error,
                  durationMs: stepResult.durationMs,
                })),
                artifacts: {
                  tracePath,
                  screenshotPath,
                },
                warnings: [...artifactWarnings],
              });
              await writePlayFailureReport(report, artifactPaths.reportPath);
              reportPath = artifactPaths.reportPath;
            } catch (reportErr) {
              const message = reportErr instanceof Error ? reportErr.message : String(reportErr);
              artifactWarnings.push(`Failed to write failure report JSON: ${message}`);
            }

            failureArtifacts = {
              runId,
              testSlug: artifactPaths.testSlug,
              reportPath,
              tracePath,
              screenshotPath,
            };
          }
        }

        break; // stop on first failure
      }
    }
  } finally {
    if (context && tracingStarted && !tracingStopped) {
      try {
        await context.tracing.stop();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        artifactWarnings.push(`Failed to stop trace capture cleanly: ${message}`);
      }
    }
    await context?.close();
    await browser?.close();
  }

  const passed = stepResults.every((r) => r.passed);
  return {
    name: test.name,
    file: absoluteFilePath,
    steps: stepResults,
    passed,
    durationMs: Date.now() - testStart,
    failureArtifacts,
    artifactWarnings: artifactWarnings.length > 0 ? artifactWarnings : undefined,
  };
}

async function launchBrowser(headed?: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ headless: !headed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      throw new UserError(
        "Chromium browser is not installed.",
        "Run: npx playwright install chromium"
      );
    }
    throw err;
  }
}

function quote(s: string): string {
  return "'" + s + "'";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function readQuotedString(input: string, quoteIndex: number): string | undefined {
  const quote = input[quoteIndex];
  if (quote !== "'" && quote !== '"') return undefined;

  let result = "";
  let escaped = false;
  for (let i = quoteIndex + 1; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return result;
    }
    result += ch;
  }
  return undefined;
}

function findUnquotedMarker(input: string, marker: string, fromIndex: number): number {
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = fromIndex; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (input.startsWith(marker, i)) {
      return i;
    }
  }

  return -1;
}

function readQuotedValueAfter(input: string, marker: string): string | undefined {
  let fromIndex = 0;
  while (fromIndex < input.length) {
    const markerIndex = findUnquotedMarker(input, marker, fromIndex);
    if (markerIndex === -1) return undefined;

    let i = markerIndex + marker.length;
    while (i < input.length && /\s/.test(input[i])) i += 1;

    const value = readQuotedString(input, i);
    if (value !== undefined) return value;

    fromIndex = markerIndex + marker.length;
  }
  return undefined;
}

function targetLabel(step: Step): string {
  if (step.action === "navigate") return "";
  if (step.action === "press") return step.key;
  const val = step.target.value;
  if (step.target.kind === "locatorExpression") {
    const nameArg = readQuotedValueAfter(val, "name:");
    if (nameArg) return nameArg;
    const firstArg = readQuotedValueAfter(val, "(");
    if (firstArg) return firstArg;
  }
  return truncate(val, 30);
}

const SENSITIVE_PATTERN =
  /password|passwd|pwd|secret|token|credential|api.?key/i;

function isSensitiveTarget(step: Step): boolean {
  if (step.action === "navigate") return false;
  return SENSITIVE_PATTERN.test(step.target.value);
}

function stepDetail(step: Step): string {
  const masked = isSensitiveTarget(step);
  if (step.action === "fill") {
    const val = masked ? "\u2022\u2022\u2022\u2022" : truncate(step.text, 20);
    return ' \u2192 "' + val + '"';
  }
  if (step.action === "assertText") {
    return ' \u2192 "' + truncate(step.text, 20) + '"';
  }
  if (step.action === "assertValue" || step.action === "select") {
    const val = masked ? "\u2022\u2022\u2022\u2022" : truncate(step.value, 20);
    return ' \u2192 "' + val + '"';
  }
  return "";
}

function stepDescription(step: Step, index: number): string {
  const desc =
    "description" in step && step.description ? " - " + step.description : "";
  if (step.action === "navigate") {
    return "Step " + (index + 1) + ": navigate to " + step.url + desc;
  }
  const label = targetLabel(step);
  const target = label ? " " + quote(label) : "";
  const detail = stepDetail(step);
  return "Step " + (index + 1) + ": " + step.action + target + detail + desc;
}

// Exports for testing
export {
  resolveLocator,
  resolveLocatorContext,
  resolveNavigateUrl,
  stepDescription,
  waitForPostStepNetworkIdle,
  isPlaywrightTimeoutError,
  isPlaywrightLocator,
};
