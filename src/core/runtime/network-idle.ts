import { errors as playwrightErrors, type Page } from "playwright";
import type { Step } from "../yaml-schema.js";

export const DEFAULT_WAIT_FOR_NETWORK_IDLE = false;

export interface PostStepReadinessResult {
  navigationTimedOut: boolean;
  networkIdleTimedOut: boolean;
  usedNavigationWait: boolean;
  usedNetworkIdleWait: boolean;
}

export async function waitForPostStepReadiness(input: {
  page: Page;
  step: Step;
  waitForNetworkIdle: boolean;
  timeoutMs?: number;
  beforeUrl?: string;
}): Promise<PostStepReadinessResult> {
  const afterUrl = readPageUrl(input.page);
  const usedNavigationWait = shouldWaitForNavigation(input.step, input.beforeUrl, afterUrl);
  let navigationTimedOut = false;
  let networkIdleTimedOut = false;

  if (usedNavigationWait) {
    try {
      await waitForLoadState(input.page, "domcontentloaded", input.timeoutMs);
    } catch (err) {
      if (isPlaywrightTimeoutError(err)) {
        navigationTimedOut = true;
      } else {
        throw err;
      }
    }
  }

  if (input.waitForNetworkIdle) {
    try {
      await waitForLoadState(input.page, "networkidle", input.timeoutMs);
    } catch (err) {
      if (isPlaywrightTimeoutError(err)) {
        networkIdleTimedOut = true;
      } else {
        throw err;
      }
    }
  }

  return {
    navigationTimedOut,
    networkIdleTimedOut,
    usedNavigationWait,
    usedNetworkIdleWait: input.waitForNetworkIdle,
  };
}

export async function waitForPostStepNetworkIdle(
  page: Page,
  enabled: boolean,
  timeoutMs?: number
): Promise<boolean> {
  if (!enabled) return false;

  try {
    await waitForLoadState(page, "networkidle", timeoutMs);
    return false;
  } catch (err) {
    if (isPlaywrightTimeoutError(err)) {
      return true;
    }
    throw err;
  }
}

export function isPlaywrightTimeoutError(err: unknown): boolean {
  if (err instanceof playwrightErrors.TimeoutError) return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}

async function waitForLoadState(
  page: Page,
  state: "domcontentloaded" | "networkidle",
  timeoutMs?: number
): Promise<void> {
  if (timeoutMs === undefined) {
    await page.waitForLoadState(state);
  } else {
    await page.waitForLoadState(state, { timeout: timeoutMs });
  }
}

function shouldWaitForNavigation(
  step: Step,
  beforeUrl: string | undefined,
  afterUrl: string | undefined
): boolean {
  if (step.action === "navigate") return true;
  if (!beforeUrl || !afterUrl) return false;
  return normalizeUrl(beforeUrl) !== normalizeUrl(afterUrl);
}

function readPageUrl(page: Page): string | undefined {
  try {
    return page.url();
  } catch {
    return undefined;
  }
}

function normalizeUrl(value: string): string {
  return value.trim();
}
