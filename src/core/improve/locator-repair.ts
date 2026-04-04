import type { Target } from "../yaml-schema.js";
import type { ImproveDiagnostic } from "./report-schema.js";
import type { TargetCandidate } from "./candidate-generator.js";
import { type DynamicSignal } from "./dynamic-target.js";
import {
  buildDynamicTargetDiagnostic,
  buildLocatorDynamicSignals,
  buildLocatorRepairCandidates,
  buildUnsupportedExpressionDiagnostic,
  looksPotentiallyBrittleExpression,
  parseSupportedLocatorExpression,
} from "./locator-repair-support.js";

export interface LocatorRepairAnalysis {
  candidates: TargetCandidate[];
  diagnostics: ImproveDiagnostic[];
  dynamicTarget: boolean;
  dynamicSignals: DynamicSignal[];
}

export function analyzeAndBuildLocatorRepairCandidates(input: {
  target: Target;
  stepNumber: number;
}): LocatorRepairAnalysis {
  if (input.target.kind !== "locatorExpression") {
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const expression = input.target.value.trim();
  const parse = parseSupportedLocatorExpression(expression);
  if (!parse) {
    if (looksPotentiallyBrittleExpression(expression)) {
      return {
        candidates: [],
        diagnostics: [buildUnsupportedExpressionDiagnostic(input.stepNumber)],
        dynamicTarget: true,
        dynamicSignals: ["unsupported_expression_shape"],
      };
    }
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const dynamicSignals = buildLocatorDynamicSignals(parse);

  if (dynamicSignals.length === 0) {
    return { candidates: [], diagnostics: [], dynamicTarget: false, dynamicSignals: [] };
  }

  const candidates = buildLocatorRepairCandidates({
    target: input.target,
    parsed: parse,
    dynamicSignals,
  });

  return {
    candidates,
    diagnostics: [buildDynamicTargetDiagnostic(input.stepNumber, dynamicSignals)],
    dynamicTarget: true,
    dynamicSignals,
  };
}
