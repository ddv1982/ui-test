/**
 * Converts Chrome DevTools Recorder JSON exports into ui-test Step[].
 *
 * Chrome DevTools Recorder exports a framework-agnostic JSON format
 * with multiple selector alternatives per action (CSS, ARIA, XPath).
 * This adapter converts that format into the ui-test YAML step format.
 */

import type { Step, Target } from "../yaml-schema.js";
import { classifySelector } from "../selector-classifier.js";
import { scoreLocatorConfidence } from "./locator-confidence.js";

export interface DevToolsRecording {
  title?: string;
  steps: DevToolsStep[];
}

export interface DevToolsStep {
  type: string;
  url?: string;
  selectors?: DevToolsSelector[][];
  offsetX?: number;
  offsetY?: number;
  value?: string;
  key?: string;
  assertedEvents?: unknown[];
  [key: string]: unknown;
}

type DevToolsSelector = string;

export interface DevToolsConvertResult {
  steps: Step[];
  title?: string;
  skipped: number;
}

export function devtoolsRecordingToSteps(json: string): DevToolsConvertResult {
  let recording: DevToolsRecording;
  try {
    recording = JSON.parse(json) as DevToolsRecording;
  } catch {
    return { steps: [], skipped: 0 };
  }

  if (!recording || !Array.isArray(recording.steps)) {
    return { steps: [], title: recording?.title, skipped: 0 };
  }

  const steps: Step[] = [];
  let skipped = 0;
  const devSteps = recording.steps;

  for (let i = 0; i < devSteps.length; i++) {
    const devStep = devSteps[i];
    if (!devStep) continue;
    const result = convertStep(devStep, devSteps, i);
    if (result === "skip") {
      skipped++;
      continue;
    }
    if (result === "consumed") {
      continue;
    }
    steps.push(result);
  }

  return { steps, title: recording.title, skipped };
}

function convertStep(
  step: DevToolsStep,
  allSteps: DevToolsStep[],
  index: number
): Step | "skip" | "consumed" {
  switch (step.type) {
    case "navigate":
      return { action: "navigate", url: step.url ?? "/" };

    case "click":
      return convertClickStep(step);

    case "doubleClick":
      return convertClickStep(step, "dblclick");

    case "hover":
      return convertClickStep(step, "hover");

    case "change":
      return convertChangeStep(step);

    case "keyDown":
      return convertKeyStep(step, allSteps, index);

    case "keyUp":
      return "consumed";

    case "waitForElement":
      return convertWaitStep(step);

    case "scroll":
    case "setViewport":
    case "emulateNetworkConditions":
    case "close":
      return "skip";

    default:
      return "skip";
  }
}

function convertClickStep(step: DevToolsStep, action: "click" | "dblclick" | "hover" = "click"): Step | "skip" {
  const target = selectBestTarget(step.selectors);
  if (!target) return "skip";
  return { action, target } as Step;
}

function convertChangeStep(step: DevToolsStep): Step | "skip" {
  const target = selectBestTarget(step.selectors);
  if (!target) return "skip";
  return { action: "fill", target, text: step.value ?? "" };
}

function convertKeyStep(
  step: DevToolsStep,
  allSteps: DevToolsStep[],
  index: number
): Step | "skip" {
  const key = step.key;
  if (!key) return "skip";

  const nextStep = allSteps[index + 1];
  if (nextStep?.type === "keyUp" && nextStep.key === key) {
    const target = selectBestTarget(step.selectors);
    if (!target) return "skip";
    return { action: "press", target, key };
  }

  return "skip";
}

function convertWaitStep(step: DevToolsStep): Step | "skip" {
  const target = selectBestTarget(step.selectors);
  if (!target) return "skip";
  return { action: "assertVisible", target };
}

function selectBestTarget(
  selectorGroups: DevToolsSelector[][] | undefined
): Target | null {
  if (!selectorGroups || selectorGroups.length === 0) return null;

  const flatSelectors = selectorGroups
    .map((group) => group.join(" >> "))
    .filter((s) => s.length > 0);

  if (flatSelectors.length === 0) return null;

  const ariaSelector = flatSelectors.find((s) => s.startsWith("aria/"));
  if (ariaSelector) {
    if (ariaSelector.includes(" >> ")) {
      // Multi-segment shadow DOM selector — convert last ARIA segment
      const segments = ariaSelector.split(" >> ");
      const lastAria = [...segments].reverse().find((s) => s.startsWith("aria/"));
      if (lastAria) {
        const locatorExpr = ariaToLocatorExpression(lastAria);
        if (locatorExpr) {
          return {
            value: locatorExpr,
            kind: "locatorExpression",
            source: "devtools-import",
            confidence: Math.max(scoreLocatorConfidence(locatorExpr) - 0.1, 0),
          };
        }
      }
    } else {
      const locatorExpr = ariaToLocatorExpression(ariaSelector);
      if (locatorExpr) {
        return {
          value: locatorExpr,
          kind: "locatorExpression",
          source: "devtools-import",
          confidence: scoreLocatorConfidence(locatorExpr),
        };
      }
    }
  }

  const testIdSelector = flatSelectors.find((s) =>
    s.includes("[data-testid=") || s.includes("[data-test-id=")
  );
  if (testIdSelector) {
    const testId = extractTestId(testIdSelector);
    if (testId) {
      const locatorExpr = `getByTestId('${escapeSingleQuotes(testId)}')`;
      return {
        value: locatorExpr,
        kind: "locatorExpression",
        source: "devtools-import",
        confidence: scoreLocatorConfidence(locatorExpr),
      };
    }
  }

  const cssSelector = flatSelectors.find(
    (s) => !s.startsWith("xpath/") && !s.startsWith("aria/") && !s.startsWith("pierce/")
  );
  if (cssSelector) {
    const kind = classifySelector(cssSelector).kind;
    return {
      value: cssSelector.includes(" >> ") ? `locator('${escapeSingleQuotes(cssSelector)}')` : cssSelector,
      kind: cssSelector.includes(" >> ") ? "locatorExpression" : kind,
      source: "devtools-import",
      confidence: 0.5,
    };
  }

  const xpathSelector = flatSelectors.find((s) => s.startsWith("xpath/"));
  if (xpathSelector) {
    const xpath = xpathSelector.slice("xpath/".length);
    return {
      value: xpath,
      kind: "xpath",
      source: "devtools-import",
      confidence: 0.3,
    };
  }

  return null;
}

function ariaToLocatorExpression(ariaSelector: string): string | null {
  const body = ariaSelector.slice("aria/".length).trim();
  if (!body) return null;

  const roleMatch = body.match(/\[role="([^"]+)"\]/);
  if (roleMatch) {
    const roleIdx = body.indexOf(roleMatch[0]);
    const name = body.slice(0, roleIdx).trim();
    const role = roleMatch[1]!;
    if (name) {
      return `getByRole('${escapeSingleQuotes(role)}', { name: '${escapeSingleQuotes(name)}' })`;
    }
    return `getByRole('${escapeSingleQuotes(role)}')`;
  }

  return `getByLabel('${escapeSingleQuotes(body)}')`;
}

function extractTestId(selector: string): string | null {
  const patterns = [
    /\[data-testid="([^"]+)"\]/,
    /\[data-test-id="([^"]+)"\]/,
    /\[data-testid='([^']+)'\]/,
    /\[data-test-id='([^']+)'\]/,
    /\[data-testid=([^\]\s]+)\]/,
    /\[data-test-id=([^\]\s]+)\]/,
  ];
  for (const pattern of patterns) {
    const match = selector.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
