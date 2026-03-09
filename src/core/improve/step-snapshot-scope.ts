import type { Locator, Page } from "playwright";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { Step } from "../yaml-schema.js";

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
  for (const candidate of buildSnapshotScopeCandidates(page, step)) {
    const preSnapshot = await candidate.locator
      .ariaSnapshot({ timeout: timeoutMs })
      .catch(() => undefined);
    if (!preSnapshot) continue;
    return {
      scope: candidate.scope,
      preSnapshot,
      capturePostSnapshot: () =>
        candidate.locator.ariaSnapshot({ timeout: timeoutMs }).catch(() => undefined),
    };
  }
  return undefined;
}

function buildSnapshotScopeCandidates(
  page: Page,
  step: Step
): Array<{ scope: StepSnapshotScope; locator: Locator }> {
  const candidates: Array<{ scope: StepSnapshotScope; locator: Locator }> = [];

  if (
    step.action !== "navigate" &&
    step.action !== "assertUrl" &&
    step.action !== "assertTitle" &&
    "target" in step &&
    step.target
  ) {
    try {
      candidates.push({
        scope: "target",
        locator: narrowLocator(resolveLocator(page, step.target)),
      });
    } catch {
      // Ignore invalid target resolution and continue to broader scopes.
    }
  }

  candidates.push({
    scope: "landmark",
    locator: narrowLocator(page.locator("dialog, [role='dialog'], main, [role='main'], form")),
  });
  candidates.push({
    scope: "body",
    locator: page.locator("body"),
  });

  return candidates;
}

function narrowLocator(locator: Locator): Locator {
  return typeof locator.first === "function" ? locator.first() : locator;
}
