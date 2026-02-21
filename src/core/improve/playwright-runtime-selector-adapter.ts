import type { Locator, Page } from "playwright";
import { looksLikeLocatorExpression } from "../locator-expression.js";
import type { Target } from "../yaml-schema.js";

interface SelectorResolutionPayload {
  resolvedSelector: string;
}

interface LocatorWithPrivateResolveSelector extends Locator {
  _resolveSelector?: () => Promise<SelectorResolutionPayload>;
}

export interface RuntimeSelectorAdapterDependencies {
  toLocatorExpressionFromSelectorFn?: (
    page: Page,
    selector: string
  ) => string | undefined;
}

export function convertRuntimeTargetToLocatorExpression(
  page: Page,
  target: Target,
  dependencies: RuntimeSelectorAdapterDependencies = {}
): string | undefined {
  if (target.kind !== "internal" && target.kind !== "playwrightSelector") {
    return undefined;
  }

  const converter = dependencies.toLocatorExpressionFromSelectorFn ?? toLocatorExpressionFromSelector;
  return converter(page, target.value);
}

export function getPrivateResolveSelector(
  locator: Locator
): (() => Promise<SelectorResolutionPayload>) | undefined {
  const candidate = locator as LocatorWithPrivateResolveSelector;
  const maybeFn = candidate._resolveSelector;
  if (typeof maybeFn !== "function") return undefined;
  return maybeFn;
}

export function readResolvedSelectorValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybeSelector = (value as Record<string, unknown>)["resolvedSelector"];
  if (typeof maybeSelector !== "string") return undefined;
  const trimmed = maybeSelector.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toLocatorExpressionFromSelector(
  page: Page,
  selector: string
): string | undefined {
  try {
    const locator = page.locator(selector);
    const expression = locator.toString();
    return normalizeLocatorExpression(expression);
  } catch {
    return undefined;
  }
}

export function shouldRetainFramePath(
  locatorExpression: string,
  framePath: string[] | undefined
): boolean {
  if (!framePath || framePath.length === 0) return false;
  if (locatorExpression.startsWith("frameLocator(")) return false;
  if (locatorExpression.includes(".frameLocator(")) return false;
  if (locatorExpression.startsWith("contentFrame(")) return false;
  if (locatorExpression.includes(".contentFrame(")) return false;
  return true;
}

function normalizeLocatorExpression(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const withoutAwait = trimmed.replace(/^await\s+/u, "");
  const withoutSemicolon = withoutAwait.endsWith(";")
    ? withoutAwait.slice(0, -1).trim()
    : withoutAwait;
  const withoutPagePrefix = withoutSemicolon.startsWith("page.")
    ? withoutSemicolon.slice("page.".length)
    : withoutSemicolon;
  const normalized = withoutPagePrefix.trim();
  if (!looksLikeLocatorExpression(normalized)) return undefined;
  return normalized;
}
