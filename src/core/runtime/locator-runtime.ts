import type { FrameLocator, Locator, Page } from "playwright";
import type { Step, Target } from "../yaml-schema.js";
import { evaluateLocatorExpression } from "../locator-expression.js";
import { UserError } from "../../utils/errors.js";

export type TargetStep = Extract<Step, { target: unknown }>;
export type LocatorContext = Page | FrameLocator;

export function resolveLocator(
  page: Page,
  targetOrStep: Target | TargetStep
): Locator {
  const target = "action" in targetOrStep ? targetOrStep.target : targetOrStep;
  const context = resolveLocatorContext(page, target.framePath);

  return resolveTargetLocator(context, target);
}

export async function resolveActionLocator(
  page: Page,
  targetOrStep: Target | TargetStep
): Promise<Locator> {
  const target = "action" in targetOrStep ? targetOrStep.target : targetOrStep;
  const context = resolveLocatorContext(page, target.framePath);
  const primary = resolveTargetLocator(context, target);

  if (!target.fallbacks || target.fallbacks.length === 0) {
    return primary;
  }

  if (await locatorHasMatches(primary)) {
    return primary;
  }

  for (const fallback of target.fallbacks) {
    try {
      const fallbackLocator = resolveTargetLocator(context, fallback);
      if (await locatorHasMatches(fallbackLocator)) {
        return fallbackLocator;
      }
    } catch {
      // Skip invalid fallback silently - primary locator is still valid.
    }
  }

  return primary;
}

function resolveTargetLocator(context: LocatorContext, target: Target): Locator {
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

async function locatorHasMatches(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) > 0;
  } catch {
    return false;
  }
}

export function resolveLocatorContext(page: Page, framePath?: string[]): LocatorContext {
  let context: LocatorContext = page;
  if (!framePath || framePath.length === 0) return context;

  for (const frameSelector of framePath) {
    if (!frameSelector.trim()) continue;
    context = context.frameLocator(frameSelector);
  }

  return context;
}

export function isPlaywrightLocator(value: unknown): value is Locator {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Locator>;
  return (
    typeof candidate.locator === "function" &&
    typeof candidate.click === "function" &&
    typeof candidate.waitFor === "function"
  );
}

export function resolveNavigateUrl(
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
      "Use an absolute URL, or set baseUrl in the test for relative paths."
    );
  }

  throw new UserError(
    `Cannot resolve relative navigation URL: ${stepUrl}`,
    "Set baseUrl in the test, or navigate to an absolute URL first."
  );
}
