import type { Locator, Page } from "playwright";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { Step } from "../yaml-schema.js";
import { captureAriaSnapshot } from "./aria-snapshot-support.js";

export type StepSnapshotScope = "target" | "landmark" | "body";

export interface PreparedStepSnapshot {
  scope: StepSnapshotScope;
  preSnapshot: string;
  capturePostSnapshot: () => Promise<string | undefined>;
}

export async function prepareScopedStepSnapshot(
  page: Page,
  step: Step,
  timeoutMs: number
): Promise<PreparedStepSnapshot | undefined> {
  for (const candidate of buildSnapshotScopeCandidates(page, step, timeoutMs)) {
    const preSnapshot = await candidate.captureSnapshot().catch(() => undefined);
    if (!preSnapshot) continue;
    return {
      scope: candidate.scope,
      preSnapshot,
      capturePostSnapshot: () => candidate.captureSnapshot().catch(() => undefined),
    };
  }
  return undefined;
}

function buildSnapshotScopeCandidates(
  page: Page,
  step: Step,
  timeoutMs: number
): Array<{ scope: StepSnapshotScope; captureSnapshot: () => Promise<string> }> {
  const candidates: Array<{ scope: StepSnapshotScope; captureSnapshot: () => Promise<string> }> = [];

  if (
    step.action !== "navigate" &&
    step.action !== "assertUrl" &&
    step.action !== "assertTitle" &&
    "target" in step &&
    step.target
  ) {
    try {
      const locator = narrowLocator(resolveLocator(page, step.target));
      candidates.push({
        scope: "target",
        captureSnapshot: () => captureAriaSnapshot(locator, { timeout: timeoutMs }),
      });
    } catch {
      // Ignore invalid target resolution and continue to broader scopes.
    }
  }

  candidates.push({
    scope: "landmark",
    captureSnapshot: () =>
      captureAriaSnapshot(narrowLocator(page.locator("dialog, [role='dialog'], main, [role='main'], form")), {
        timeout: timeoutMs,
      }),
  });
  candidates.push({
    scope: "body",
    captureSnapshot: () =>
      page
        .ariaSnapshot({
          timeout: timeoutMs,
          mode: "ai",
          depth: 6,
        })
        .catch(() => captureAriaSnapshot(page.locator("body"), { timeout: timeoutMs })),
  });

  return candidates;
}

function narrowLocator(locator: Locator): Locator {
  return typeof locator.first === "function" ? locator.first() : locator;
}
