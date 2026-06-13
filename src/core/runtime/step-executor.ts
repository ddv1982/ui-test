import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { resolveActionLocator, resolveNavigateUrl } from "./locator-runtime.js";

const ASSERTION_POLL_INTERVAL_MS = 25;

export type RuntimeExecutionMode = "playback" | "analysis";

export interface RuntimeStepExecutionOptions {
  timeout: number;
  baseUrl?: string;
  mode: RuntimeExecutionMode;
}

export async function executeRuntimeStep(
  page: Page,
  step: Step,
  options: RuntimeStepExecutionOptions
): Promise<void> {
  const timeout = step.timeout ?? options.timeout;

  switch (step.action) {
    case "navigate": {
      const url = resolveNavigateUrl(step.url, options.baseUrl, page.url());
      await page.goto(url, { timeout });
      return;
    }

    case "click":
      await (await resolveActionLocator(page, step)).click({ timeout });
      return;

    case "dblclick":
      await (await resolveActionLocator(page, step)).dblclick({ timeout });
      return;

    case "fill":
      await (await resolveActionLocator(page, step)).fill(step.text, { timeout });
      return;

    case "press":
      await (await resolveActionLocator(page, step)).press(step.key, { timeout });
      return;

    case "check":
      await (await resolveActionLocator(page, step)).check({ timeout });
      return;

    case "uncheck":
      await (await resolveActionLocator(page, step)).uncheck({ timeout });
      return;

    case "hover":
      await (await resolveActionLocator(page, step)).hover({ timeout });
      return;

    case "select":
      await (await resolveActionLocator(page, step)).selectOption(step.value, { timeout });
      return;

    case "assertVisible": {
      if (options.mode === "analysis") return;
      await (await resolveActionLocator(page, step)).waitFor({
        state: "visible",
        timeout,
      });
      return;
    }

    case "assertText": {
      if (options.mode === "analysis") return;
      const locator = await resolveActionLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      await waitForExpectation(timeout, async () => {
        const text = await locator.textContent({ timeout });
        if (!text?.includes(step.text)) {
          throw new Error(`Expected text '${step.text}' but got '${text ?? "(empty)"}'`);
        }
      });
      return;
    }

    case "assertValue": {
      if (options.mode === "analysis") return;
      const locator = await resolveActionLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      await waitForExpectation(timeout, async () => {
        const value = await locator.inputValue({ timeout });
        if (value !== step.value) {
          throw new Error(`Expected value '${step.value}' but got '${value}'`);
        }
      });
      return;
    }

    case "assertChecked": {
      if (options.mode === "analysis") return;
      const locator = await resolveActionLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const expected = step.checked ?? true;
      await waitForExpectation(timeout, async () => {
        const isChecked = await locator.isChecked({ timeout });
        if (expected && !isChecked) {
          throw new Error("Expected element to be checked");
        }
        if (!expected && isChecked) {
          throw new Error("Expected element to be unchecked");
        }
      });
      return;
    }

    case "assertUrl": {
      if (options.mode === "analysis") return;
      const regex = wildcardPatternToRegExp(step.url);
      await waitForExpectation(timeout, () => {
        const currentUrl = page.url();
        if (!regex.test(currentUrl)) {
          throw new Error(`URL "${currentUrl}" does not match pattern "${step.url}"`);
        }
      });
      return;
    }

    case "assertTitle": {
      if (options.mode === "analysis") return;
      await waitForExpectation(timeout, async () => {
        const title = await page.title();
        if (!title.includes(step.title)) {
          throw new Error(`Expected title to contain '${step.title}' but got '${title}'`);
        }
      });
      return;
    }

    case "assertEnabled": {
      if (options.mode === "analysis") return;
      const locator = await resolveActionLocator(page, step);
      await locator.waitFor({ state: "attached", timeout });
      const expected = step.enabled ?? true;
      await waitForExpectation(timeout, async () => {
        const isEnabled = await locator.isEnabled({ timeout });
        if (expected && !isEnabled) {
          throw new Error("Expected element to be enabled");
        }
        if (!expected && isEnabled) {
          throw new Error("Expected element to be disabled");
        }
      });
      return;
    }
  }
}

async function waitForExpectation(
  timeout: number,
  assertion: () => void | Promise<void>
): Promise<void> {
  const deadline = Date.now() + Math.max(timeout, 0);
  let lastError: unknown;

  do {
    try {
      await assertion();
      return;
    } catch (err) {
      lastError = err;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(ASSERTION_POLL_INTERVAL_MS, remaining));
    });
  } while (Date.now() <= deadline);

  if (lastError instanceof Error) {
    throw lastError;
  }
  const message = typeof lastError === "string" ? lastError : "Assertion did not pass before timeout";
  throw new Error(message);
}

function wildcardPatternToRegExp(pattern: string): RegExp {
  const escapedSegments = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escapedSegments.join(".*")}$`);
}
