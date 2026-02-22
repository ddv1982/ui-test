import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { resolveLocator, resolveNavigateUrl } from "./locator-runtime.js";

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
      await resolveLocator(page, step).click({ timeout });
      return;

    case "dblclick":
      await resolveLocator(page, step).dblclick({ timeout });
      return;

    case "fill":
      await resolveLocator(page, step).fill(step.text, { timeout });
      return;

    case "press":
      await resolveLocator(page, step).press(step.key, { timeout });
      return;

    case "check":
      await resolveLocator(page, step).check({ timeout });
      return;

    case "uncheck":
      await resolveLocator(page, step).uncheck({ timeout });
      return;

    case "hover":
      await resolveLocator(page, step).hover({ timeout });
      return;

    case "select":
      await resolveLocator(page, step).selectOption(step.value, { timeout });
      return;

    case "assertVisible": {
      if (options.mode === "analysis") return;
      await resolveLocator(page, step).waitFor({
        state: "visible",
        timeout,
      });
      return;
    }

    case "assertText": {
      if (options.mode === "analysis") return;
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const text = await locator.textContent({ timeout });
      if (!text?.includes(step.text)) {
        throw new Error(`Expected text '${step.text}' but got '${text ?? "(empty)"}'`);
      }
      return;
    }

    case "assertValue": {
      if (options.mode === "analysis") return;
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const value = await locator.inputValue({ timeout });
      if (value !== step.value) {
        throw new Error(`Expected value '${step.value}' but got '${value}'`);
      }
      return;
    }

    case "assertChecked": {
      if (options.mode === "analysis") return;
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "visible", timeout });
      const isChecked = await locator.isChecked({ timeout });
      const expected = step.checked ?? true;
      if (expected && !isChecked) {
        throw new Error("Expected element to be checked");
      }
      if (!expected && isChecked) {
        throw new Error("Expected element to be unchecked");
      }
      return;
    }

    case "assertUrl": {
      if (options.mode === "analysis") return;
      const currentUrl = page.url();
      const regex = wildcardPatternToRegExp(step.url);
      if (!regex.test(currentUrl)) {
        throw new Error(`URL "${currentUrl}" does not match pattern "${step.url}"`);
      }
      return;
    }

    case "assertTitle": {
      if (options.mode === "analysis") return;
      const title = await page.title();
      if (!title.includes(step.title)) {
        throw new Error(`Expected title to contain '${step.title}' but got '${title}'`);
      }
      return;
    }

    case "assertEnabled": {
      if (options.mode === "analysis") return;
      const locator = resolveLocator(page, step);
      await locator.waitFor({ state: "attached", timeout });
      const isEnabled = await locator.isEnabled({ timeout });
      const expected = step.enabled ?? true;
      if (expected && !isEnabled) {
        throw new Error("Expected element to be enabled");
      }
      if (!expected && isEnabled) {
        throw new Error("Expected element to be disabled");
      }
      return;
    }
  }
}

function wildcardPatternToRegExp(pattern: string): RegExp {
  const escapedSegments = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escapedSegments.join(".*")}$`);
}
