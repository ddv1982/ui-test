import type { Locator, Page } from "playwright";
import { looksLikeLocatorExpression } from "../locator-expression.js";
import { resolveLocator } from "../runtime/locator-runtime.js";
import type { Target } from "../yaml-schema.js";
import type { TargetCandidate } from "./candidate-generator.js";
import {
  assessTargetDynamics,
  type DynamicSignal,
} from "./dynamic-target.js";
import type { ImproveDiagnostic } from "./report-schema.js";
import {
  convertRuntimeTargetToLocatorExpression,
  shouldRetainFramePath,
  toLocatorExpressionFromSelector,
} from "./playwright-runtime-selector-adapter.js";

export type RuntimeRepairSource = "normalize" | "public_conversion";

export interface RuntimeRepairSourceMarker {
  candidateId: string;
  source: RuntimeRepairSource;
}

export interface RuntimeRepairDependencies {
  resolveLocatorFn?: typeof resolveLocator;
  toLocatorExpressionFromSelectorFn?: (selector: string) => string | undefined;
}

export interface RuntimeRepairInput {
  page: Page;
  target: Target;
  stepNumber: number;
  dynamicSignals?: DynamicSignal[];
}

export interface RuntimeRepairResult {
  candidates: TargetCandidate[];
  diagnostics: ImproveDiagnostic[];
  dynamicSignals: DynamicSignal[];
  runtimeUnique: boolean;
  sourceMarkers: RuntimeRepairSourceMarker[];
}

export async function generateRuntimeRepairCandidates(
  input: RuntimeRepairInput,
  dependencies: RuntimeRepairDependencies = {}
): Promise<RuntimeRepairResult> {
  const diagnostics: ImproveDiagnostic[] = [];
  const sourceMarkers: RuntimeRepairSourceMarker[] = [];
  const dynamicSignals =
    input.dynamicSignals ?? assessTargetDynamics(input.target).dynamicSignals;
  const resolveLocatorFn = dependencies.resolveLocatorFn ?? resolveLocator;
  const toLocatorExpressionFromSelectorFn =
    dependencies.toLocatorExpressionFromSelectorFn ?? toLocatorExpressionFromSelector;

  let locator: Locator;
  try {
    locator = resolveLocatorFn(input.page, input.target);
  } catch {
    diagnostics.push({
      code: "selector_repair_playwright_runtime_unavailable",
      level: "warn",
      message:
        `Step ${input.stepNumber}: Playwright runtime selector resolution was unavailable for this target.`,
    });
    return {
      candidates: [],
      diagnostics,
      dynamicSignals,
      runtimeUnique: false,
      sourceMarkers,
    };
  }

  let matchCount: number;
  try {
    matchCount = await locator.count();
  } catch {
    diagnostics.push({
      code: "selector_repair_playwright_runtime_unavailable",
      level: "warn",
      message:
        `Step ${input.stepNumber}: Playwright runtime selector matching failed before regeneration.`,
    });
    return {
      candidates: [],
      diagnostics,
      dynamicSignals,
      runtimeUnique: false,
      sourceMarkers,
    };
  }

  if (matchCount !== 1) {
    diagnostics.push({
      code: "selector_repair_playwright_runtime_non_unique",
      level: "info",
      message:
        `Step ${input.stepNumber}: skipped Playwright runtime selector regeneration because match count was ${matchCount}.`,
    });
    return {
      candidates: [],
      diagnostics,
      dynamicSignals,
      runtimeUnique: false,
      sourceMarkers,
    };
  }

  const candidateByKey = new Map<string, TargetCandidate>();

  const pushCandidate = (
    locatorExpression: string,
    source: RuntimeRepairSource
  ): void => {
    const target: Target = {
      value: locatorExpression,
      kind: "locatorExpression",
      source: "manual",
      ...(shouldRetainFramePath(locatorExpression, input.target.framePath)
        ? { framePath: input.target.framePath }
        : {}),
    };
    const key = targetKey(target);
    if (candidateByKey.has(key)) return;
    const candidate: TargetCandidate = {
      id: `repair-playwright-runtime-${candidateByKey.size + 1}`,
      source: "derived",
      target,
      reasonCodes: ["locator_repair_playwright_runtime"],
      ...(dynamicSignals.length > 0 ? { dynamicSignals: [...dynamicSignals] } : {}),
    };
    candidateByKey.set(key, candidate);
    sourceMarkers.push({ candidateId: candidate.id, source });
    diagnostics.push({
      code: "selector_repair_generated_via_playwright_runtime",
      level: "info",
      message:
        source === "public_conversion"
          ? `Step ${input.stepNumber}: converted ${input.target.kind} selector to locator expression via Playwright runtime.`
          : `Step ${input.stepNumber}: generated a runtime selector repair candidate via Playwright internal resolver.`,
    });
  };

  const normalizedCandidate = await tryNormalizedConversion(
    locator,
    input.page,
    input.target,
    resolveLocatorFn
  );
  if (normalizedCandidate) {
    pushCandidate(normalizedCandidate, "normalize");
  }

  const publicCandidate = tryPublicConversion(
    input.target,
    toLocatorExpressionFromSelectorFn
  );
  if (publicCandidate) {
    pushCandidate(publicCandidate, "public_conversion");
  }

  if (candidateByKey.size === 0) {
    diagnostics.push({
      code: "selector_repair_playwright_runtime_conversion_failed",
      level: "warn",
      message:
        `Step ${input.stepNumber}: could not convert runtime selector to a locator expression.`,
    });
  }

  return {
    candidates: [...candidateByKey.values()],
    diagnostics,
    dynamicSignals,
    runtimeUnique: true,
    sourceMarkers,
  };
}

function tryPublicConversion(
  target: Target,
  toLocatorExpressionFromSelectorFn: RuntimeRepairDependencies["toLocatorExpressionFromSelectorFn"]
): string | undefined {
  const adapterDependencies =
    toLocatorExpressionFromSelectorFn === undefined
      ? {}
      : { convertSelectorFn: toLocatorExpressionFromSelectorFn };
  return convertRuntimeTargetToLocatorExpression(target, adapterDependencies);
}

async function tryNormalizedConversion(
  locator: Locator,
  page: Page,
  target: Target,
  resolveLocatorFn: typeof resolveLocator
): Promise<string | undefined> {
  if (typeof locator.normalize !== "function") return undefined;

  try {
    const normalized = await locator.normalize();
    const locatorExpression = normalized.toString().trim();
    if (!looksLikeLocatorExpression(locatorExpression)) return undefined;

    const normalizedTarget: Target = {
      value: locatorExpression,
      kind: "locatorExpression",
      source: "manual",
      ...(shouldRetainFramePath(locatorExpression, target.framePath)
        ? { framePath: target.framePath }
        : {}),
    };

    resolveLocatorFn(page, normalizedTarget);
    return locatorExpression;
  } catch {
    return undefined;
  }
}

function targetKey(target: Target): string {
  return JSON.stringify({
    value: target.value,
    kind: target.kind,
    framePath: target.framePath ?? [],
  });
}
