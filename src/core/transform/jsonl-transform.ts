import type { Step, Target } from "../yaml-schema.js";
import { classifySelector } from "../selector-classifier.js";
import { locatorNodeToExpression, type JsonlLocatorNode } from "./selector-normalize.js";

export type RecordSelectorPolicy = "reliable" | "raw";

export interface RecordingTransformStats {
  selectorSteps: number;
  stableSelectors: number;
  fallbackSelectors: number;
  frameAwareSelectors: number;
}

export interface JsonlTransformOptions {
  selectorPolicy?: RecordSelectorPolicy;
}

interface CodegenAction {
  type?: string;
  name?: string;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  value?: string;
  options?: string[];
  locator?: JsonlLocatorNode;
  framePath?: string[];
  pageAlias?: string;
  [key: string]: unknown;
}

interface SelectorResolution {
  target: Target;
  stable: boolean;
  fallback: boolean;
  frameAware: boolean;
}

type SelectorStepBuilder = (
  selectorResolution: SelectorResolution,
  action: CodegenAction
) => Step;

const selectorStepBuilders = {
  click: (selectorResolution) => ({ action: "click", target: selectorResolution.target }),
  check: (selectorResolution) => ({ action: "check", target: selectorResolution.target }),
  uncheck: (selectorResolution) => ({ action: "uncheck", target: selectorResolution.target }),
  hover: (selectorResolution) => ({ action: "hover", target: selectorResolution.target }),
  assertVisible: (selectorResolution) => ({
    action: "assertVisible",
    target: selectorResolution.target,
  }),
  fill: (selectorResolution, action) => ({
    action: "fill",
    target: selectorResolution.target,
    text: action.text ?? action.value ?? "",
  }),
  press: (selectorResolution, action) => ({
    action: "press",
    target: selectorResolution.target,
    key: action.key ?? "",
  }),
  select: (selectorResolution, action) => ({
    action: "select",
    target: selectorResolution.target,
    value: action.value ?? action.options?.[0] ?? "",
  }),
  assertText: (selectorResolution, action) => ({
    action: "assertText",
    target: selectorResolution.target,
    text: action.text ?? "",
  }),
  assertValue: (selectorResolution, action) => ({
    action: "assertValue",
    target: selectorResolution.target,
    value: action.value ?? "",
  }),
  assertChecked: (selectorResolution) => ({
    action: "assertChecked",
    target: selectorResolution.target,
    checked: true,
  }),
} satisfies Record<string, SelectorStepBuilder>;

type SelectorActionName = keyof typeof selectorStepBuilders;

export function jsonlToSteps(
  jsonlContent: string,
  options: JsonlTransformOptions = {}
): Step[] {
  return jsonlToRecordingSteps(jsonlContent, options).steps;
}

export function jsonlToRecordingSteps(
  jsonlContent: string,
  options: JsonlTransformOptions = {}
): { steps: Step[]; stats: RecordingTransformStats } {
  const lines = jsonlContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const policy = options.selectorPolicy ?? "reliable";
  const steps: Step[] = [];
  const stats: RecordingTransformStats = {
    selectorSteps: 0,
    stableSelectors: 0,
    fallbackSelectors: 0,
    frameAwareSelectors: 0,
  };

  for (const line of lines) {
    let action: CodegenAction;
    try {
      action = JSON.parse(line) as CodegenAction;
    } catch {
      continue;
    }

    const transformed = actionToStep(action, policy);
    if (!transformed) continue;
    steps.push(transformed.step);

    if (transformed.selectorResolution) {
      stats.selectorSteps += 1;
      if (transformed.selectorResolution.stable) stats.stableSelectors += 1;
      if (transformed.selectorResolution.fallback) stats.fallbackSelectors += 1;
      if (transformed.selectorResolution.frameAware) stats.frameAwareSelectors += 1;
    }
  }

  return { steps, stats };
}

function actionToStep(
  action: CodegenAction,
  policy: RecordSelectorPolicy
): { step: Step; selectorResolution?: SelectorResolution } | null {
  const actionName = action.type ?? action.name ?? "";

  if (actionName === "openPage") {
    if (!action.url || action.url === "about:blank" || action.url === "chrome://newtab/") {
      return null;
    }
    return { step: { action: "navigate", url: action.url } };
  }

  if (actionName === "navigate") {
    return { step: { action: "navigate", url: action.url ?? "/" } };
  }

  if (!isSelectorActionName(actionName)) {
    return null;
  }

  const selectorResolution = resolveSelector(action, policy);
  if (!selectorResolution) return null;

  const step = buildSelectorStep(actionName, selectorResolution, action);
  return { step, selectorResolution };
}

function buildSelectorStep(
  actionName: SelectorActionName,
  selectorResolution: SelectorResolution,
  action: CodegenAction
): Step {
  const builder = selectorStepBuilders[actionName];
  return builder(selectorResolution, action);
}

function isSelectorActionName(actionName: string): actionName is SelectorActionName {
  return Object.hasOwn(selectorStepBuilders, actionName);
}

function resolveSelector(
  action: CodegenAction,
  policy: RecordSelectorPolicy
): SelectorResolution | null {
  const rawSelector = typeof action.selector === "string" ? action.selector.trim() : "";
  const framePath = Array.isArray(action.framePath)
    ? action.framePath.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];
  const normalized = locatorNodeToExpression(action.locator, 0, {
    dropDynamicExact: policy === "reliable",
  });

  if (policy === "raw") {
    if (rawSelector) {
      const kind = classifySelector(rawSelector).kind;
      return {
        target: {
          value: rawSelector,
          kind,
          source: "codegen-jsonl",
          ...(framePath.length > 0 ? { framePath } : {}),
        },
        stable: true,
        fallback: false,
        frameAware: framePath.length > 0,
      };
    }

    if (normalized) {
      return {
        target: {
          value: normalized,
          kind: "locatorExpression",
          source: "codegen-jsonl",
          ...(framePath.length > 0 ? { framePath } : {}),
          confidence: 0.8,
          warning: "Raw selector was unavailable, using normalized locator expression.",
        },
        stable: true,
        fallback: true,
        frameAware: framePath.length > 0,
      };
    }

    return null;
  }

  if (normalized) {
    return {
      target: {
        value: normalized,
        kind: "locatorExpression",
        source: "codegen-jsonl",
        ...(framePath.length > 0 ? { framePath } : {}),
      },
      stable: true,
      fallback: false,
      frameAware: framePath.length > 0,
    };
  }

  if (rawSelector) {
    const kind = classifySelector(rawSelector).kind;
    return {
      target: {
        value: rawSelector,
        kind,
        source: "codegen-jsonl",
        ...(framePath.length > 0 ? { framePath } : {}),
        raw: rawSelector,
        confidence: 0.4,
        warning: "Could not normalize selector from codegen locator chain; preserving raw selector.",
      },
      stable: false,
      fallback: true,
      frameAware: framePath.length > 0,
    };
  }

  return null;
}
