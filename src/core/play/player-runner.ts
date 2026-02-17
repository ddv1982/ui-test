import fs from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext } from "playwright";
import { browserLaunchers, type PlaywrightBrowser } from "../../infra/playwright/browser-provisioner.js";
import {
  PLAY_DEFAULT_ARTIFACTS_DIR,
  PLAY_DEFAULT_BROWSER,
  PLAY_DEFAULT_DELAY_MS,
  PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS,
  PLAY_DEFAULT_TIMEOUT_MS,
  PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "./play-defaults.js";
import { testSchema } from "../yaml-schema.js";
import { yamlToTest } from "../transform/yaml-io.js";
import { ValidationError, UserError } from "../../utils/errors.js";
import { isLikelyMissingBrowser } from "../../utils/chromium-runtime.js";
import {
  buildPlayFailureArtifactPaths,
  createPlayRunId,
} from "../play-failure-report.js";
import {
  startTraceCapture,
  stopTraceCaptureIfNeeded,
  type TraceCaptureState,
} from "./artifact-writer.js";
import { runPlayStepLoop } from "./step-loop.js";
import { installCookieBannerDismisser } from "../runtime/cookie-banner.js";
import type { PlayOptions, TestResult } from "./play-types.js";

export async function play(
  filePath: string,
  options: PlayOptions = {}
): Promise<TestResult> {
  const absoluteFilePath = path.resolve(filePath);
  const timeout = options.timeout ?? PLAY_DEFAULT_TIMEOUT_MS;
  const delayMs = options.delayMs ?? PLAY_DEFAULT_DELAY_MS;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE;
  const saveFailureArtifacts = options.saveFailureArtifacts ?? PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS;
  const artifactsDir = options.artifactsDir ?? PLAY_DEFAULT_ARTIFACTS_DIR;
  const runId = options.runId ?? createPlayRunId();

  const content = await fs.readFile(absoluteFilePath, "utf-8");
  const raw = yamlToTest(content);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ValidationError(`Invalid test file: ${absoluteFilePath}`, issues);
  }

  const test = parsed.data;
  const effectiveBaseUrl = test.baseUrl ?? options.baseUrl;
  const testStart = Date.now();
  const artifactWarnings: string[] = [];
  const artifactPaths = saveFailureArtifacts
    ? buildPlayFailureArtifactPaths({
        artifactsDir,
        runId,
        testFilePath: absoluteFilePath,
      })
    : undefined;

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let traceState: TraceCaptureState = {
    tracingStarted: false,
    tracingStopped: false,
  };

  let stepResults = [] as TestResult["steps"];
  let failureArtifacts = undefined as TestResult["failureArtifacts"];

  try {
    browser = await launchBrowser(options.headed, options.browser);
    context = await browser.newContext();
    await installCookieBannerDismisser(context);
    const page = await context.newPage();

    if (artifactPaths) {
      traceState = await startTraceCapture(context, test.name, artifactWarnings);
    }

    const loopResult = await runPlayStepLoop({
      page,
      context,
      steps: test.steps,
      timeout,
      delayMs,
      effectiveBaseUrl,
      waitForNetworkIdle,
      runId,
      absoluteFilePath,
      testName: test.name,
      traceState,
      artifactWarnings,
      artifactPaths,
    });

    stepResults = loopResult.stepResults;
    failureArtifacts = loopResult.failureArtifacts;
  } finally {
    if (context) {
      await stopTraceCaptureIfNeeded(context, traceState, artifactWarnings);
      await context.close();
    }
    await browser?.close();
  }

  const passed = stepResults.every((result) => result.passed);
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

async function launchBrowser(headed?: boolean, browser?: PlaywrightBrowser): Promise<Browser> {
  const browserName = browser ?? PLAY_DEFAULT_BROWSER;
  try {
    return await browserLaunchers[browserName].launch({ headless: !headed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isLikelyMissingBrowser(message)) {
      throw new UserError(
        `${browserName} browser is not installed.`,
        `Run: ui-test setup or npx playwright install ${browserName}`
      );
    }
    throw err;
  }
}
