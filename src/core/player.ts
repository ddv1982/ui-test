import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import {
  chromium,
  errors as playwrightErrors,
  type Browser,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright";
import { testSchema, type Step, type Target } from "./yaml-schema.js";
import { yamlToTest } from "./transformer.js";
import { ValidationError, UserError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";
import { evaluateLocatorExpression } from "./locator-expression.js";

const NETWORK_IDLE_WARNING_LIMIT = 3;

export interface PlayOptions {
  headed?: boolean;
  timeout?: number;
  baseUrl?: string;
  delayMs?: number;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
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
}

export async function play(
  filePath: string,
  options: PlayOptions = {}
): Promise<TestResult> {
  const timeout = options.timeout ?? 10_000;
  const delayMs = options.delayMs ?? 0;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? true;
  const networkIdleTimeout = options.networkIdleTimeout ?? 2_000;

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

  const content = await fs.readFile(filePath, "utf-8");
  const raw = yamlToTest(content);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new ValidationError(
      `Invalid test file: ${filePath}`,
      issues
    );
  }

  const test = parsed.data;
  const effectiveBaseUrl = test.baseUrl ?? options.baseUrl;
  const stepResults: StepResult[] = [];
  const testStart = Date.now();
  let networkIdleTimeoutWarnings = 0;

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await launchBrowser(options.headed);
    page = await browser.newPage();

    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepStart = Date.now();
      const desc = stepDescription(step, i);

      try {
        await executeStep(page, step, timeout, effectiveBaseUrl);
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
        break; // stop on first failure
      }
    }
  } finally {
    await browser?.close();
  }

  const passed = stepResults.every((r) => r.passed);
  return {
    name: test.name,
    file: filePath,
    steps: stepResults,
    passed,
    durationMs: Date.now() - testStart,
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

async function executeStep(
  page: Page,
  step: Step,
  timeout: number,
  baseUrl?: string
): Promise<void> {
  switch (step.action) {
    case "navigate": {
      const url = resolveNavigateUrl(step.url, baseUrl, page.url());
      await page.goto(url, { timeout });
      break;
    }

    case "click":
      await resolveLocator(page, step).click({ timeout });
      break;

    case "fill":
      await resolveLocator(page, step).fill(step.text, { timeout });
      break;

    case "press":
      await resolveLocator(page, step).press(step.key, { timeout });
      break;

    case "check":
      await resolveLocator(page, step).check({ timeout });
      break;

    case "uncheck":
      await resolveLocator(page, step).uncheck({ timeout });
      break;

    case "hover":
      await resolveLocator(page, step).hover({ timeout });
      break;

    case "select":
      await resolveLocator(page, step).selectOption(step.value, {
        timeout,
      });
      break;

    case "assertVisible":
      await resolveLocator(page, step).waitFor({
        state: "visible",
        timeout,
      });
      break;

    case "assertText": {
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const text = await locator.textContent({ timeout });
      if (!text?.includes(step.text)) {
        throw new Error(
          "Expected text '" + step.text + "' but got '" + (text ?? "(empty)") + "'"
        );
      }
      break;
    }

    case "assertValue": {
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const value = await locator.inputValue({ timeout });
      if (value !== step.value) {
        throw new Error(
          "Expected value '" + step.value + "' but got '" + value + "'"
        );
      }
      break;
    }

    case "assertChecked": {
      const locator = resolveLocator(page, step);
      const checked = step.checked ?? true;
      if (checked) {
        await locator.waitFor({ state: "visible", timeout });
        const isChecked = await locator.isChecked({ timeout });
        if (!isChecked) {
          throw new Error("Expected element to be checked");
        }
      } else {
        await locator.waitFor({ state: "visible", timeout });
        const isChecked = await locator.isChecked({ timeout });
        if (isChecked) {
          throw new Error("Expected element to be unchecked");
        }
      }
      break;
    }
  }
}

async function waitForPostStepNetworkIdle(
  page: Page,
  enabled: boolean,
  timeoutMs: number
): Promise<boolean> {
  if (!enabled) return false;

  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    return false;
  } catch (err) {
    if (isPlaywrightTimeoutError(err)) {
      return true;
    }
    throw err;
  }
}

function isPlaywrightTimeoutError(err: unknown): boolean {
  if (err instanceof playwrightErrors.TimeoutError) return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}

type TargetStep = Exclude<Step, { action: "navigate" }>;
type LocatorContext = Page | FrameLocator;

function resolveLocator(
  page: Page,
  targetOrStep: Target | TargetStep
): Locator {
  const target = "action" in targetOrStep ? targetOrStep.target : targetOrStep;
  const context = resolveLocatorContext(page, target.framePath);

  if (target.kind === "locatorExpression") {
    const resolved = evaluateLocatorExpression(context, target.value);
    if (!isPlaywrightLocator(resolved)) {
      throw new UserError(
        `Locator expression did not resolve to a locator: ${target.value}`,
        "Ensure the expression returns a Playwright locator chain."
      );
    }
    return resolved;
  }

  return context.locator(target.value);
}

function resolveLocatorContext(page: Page, framePath?: string[]): LocatorContext {
  let context: LocatorContext = page;
  if (!framePath || framePath.length === 0) return context;

  for (const frameSelector of framePath) {
    if (!frameSelector.trim()) continue;
    context = context.frameLocator(frameSelector);
  }

  return context;
}

function isPlaywrightLocator(value: unknown): value is Locator {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Locator>;
  return (
    typeof candidate.locator === "function" &&
    typeof candidate.click === "function" &&
    typeof candidate.waitFor === "function"
  );
}

function resolveNavigateUrl(
  stepUrl: string,
  baseUrl: string | undefined,
  currentPageUrl: string | undefined
): string {
  if (stepUrl.startsWith("http://") || stepUrl.startsWith("https://")) {
    return stepUrl;
  }

  try {
    if (baseUrl) {
      return new URL(stepUrl, baseUrl).toString();
    }

    const hasCurrentPageUrl =
      currentPageUrl &&
      currentPageUrl !== "about:blank" &&
      (currentPageUrl.startsWith("http://") || currentPageUrl.startsWith("https://"));

    if (stepUrl.startsWith("/") && hasCurrentPageUrl) {
      return new URL(stepUrl, currentPageUrl).toString();
    }
  } catch {
    throw new UserError(
      `Invalid navigation URL: ${stepUrl}`,
      "Use an absolute URL, or set baseUrl in the test/config for relative paths."
    );
  }

  throw new UserError(
    `Cannot resolve relative navigation URL: ${stepUrl}`,
    "Set baseUrl in the test/config, or navigate to an absolute URL first."
  );
}

function stepDescription(step: Step, index: number): string {
  const desc =
    "description" in step && step.description ? " - " + step.description : "";
  if (step.action === "navigate") {
    return "Step " + (index + 1) + ": navigate to " + step.url + desc;
  }
  return "Step " + (index + 1) + ": " + step.action + desc;
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
