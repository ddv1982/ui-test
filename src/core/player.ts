import fs from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";
import { testSchema, type Step, type TestFile } from "./yaml-schema.js";
import { yamlToTest } from "./transformer.js";
import { ValidationError, UserError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";

export interface PlayOptions {
  headed?: boolean;
  timeout?: number;
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
  const stepResults: StepResult[] = [];
  const testStart = Date.now();

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
        await executeStep(page, step, timeout, test.baseUrl);
        const result: StepResult = {
          step,
          index: i,
          passed: true,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.success(`${desc} (${result.durationMs}ms)`);
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
      const url =
        step.url.startsWith("http://") || step.url.startsWith("https://")
          ? step.url
          : (baseUrl ?? "") + step.url;
      await page.goto(url, { timeout });
      break;
    }

    case "click":
      await resolveLocator(page, step.selector).click({ timeout });
      break;

    case "fill":
      await resolveLocator(page, step.selector).fill(step.text, { timeout });
      break;

    case "press":
      await resolveLocator(page, step.selector).press(step.key, { timeout });
      break;

    case "check":
      await resolveLocator(page, step.selector).check({ timeout });
      break;

    case "uncheck":
      await resolveLocator(page, step.selector).uncheck({ timeout });
      break;

    case "hover":
      await resolveLocator(page, step.selector).hover({ timeout });
      break;

    case "select":
      await resolveLocator(page, step.selector).selectOption(step.value, {
        timeout,
      });
      break;

    case "assertVisible":
      await resolveLocator(page, step.selector).waitFor({
        state: "visible",
        timeout,
      });
      break;

    case "assertText": {
      const locator = resolveLocator(page, step.selector);
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
      const locator = resolveLocator(page, step.selector);
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
      const locator = resolveLocator(page, step.selector);
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

function resolveLocator(page: Page, selector: string) {
  // Handle Playwright getBy* methods
  const getByMatch = selector.match(
    /^(getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle|getByTestId)\((.+)\)$/
  );

  if (getByMatch) {
    const [, method, argsStr] = getByMatch;
    // Parse the arguments - could be ('text') or ('text', { options })
    const args = parseGetByArgs(argsStr);
    const fn = page[method as keyof typeof page] as (...args: unknown[]) => ReturnType<typeof page.getByRole>;
    return fn.call(page, ...args);
  }

  // Handle text= selector
  if (selector.startsWith("text=")) {
    return page.getByText(selector.slice(5));
  }

  // Default: CSS or XPath selector
  return page.locator(selector);
}

function parseGetByArgs(argsStr: string): unknown[] {
  // Wrap in array brackets to make it valid JSON-like, then eval safely
  // Examples: "'button', { name: 'Submit' }" or "'Username'"
  try {
    // Convert single quotes to double quotes for JSON parsing,
    // but handle the options object specially
    const dq = '"';
    const normalized = "[" + argsStr.replace(/'/g, dq) + "]";
    return JSON.parse(normalized);
  } catch {
    // Fallback: treat as a single string argument
    const match = argsStr.match(/^['"](.+)['"]$/);
    if (match) return [match[1]];
    return [argsStr];
  }
}

function stepDescription(step: Step, index: number): string {
  const desc =
    "description" in step && step.description ? " - " + step.description : "";
  if (step.action === "navigate") {
    return "Step " + (index + 1) + ": navigate to " + step.url + desc;
  }
  return "Step " + (index + 1) + ": " + step.action + desc;
}
