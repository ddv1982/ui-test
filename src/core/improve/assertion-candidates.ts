import type { AssertionCandidate, StepFinding } from "./report-schema.js";
import type { Step } from "../yaml-schema.js";

const COVERAGE_FALLBACK_CONFIDENCE = 0.76;

export function buildAssertionCandidates(
  steps: Step[],
  findings: StepFinding[],
  originalStepIndexes?: number[]
): AssertionCandidate[] {
  const byIndex = new Map<number, StepFinding>();
  for (const finding of findings) {
    byIndex.set(finding.index, finding);
  }

  const out: AssertionCandidate[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.action === "navigate") continue;

    const originalIndex = originalStepIndexes?.[index] ?? index;
    const finding = byIndex.get(originalIndex);
    const target = finding?.recommendedTarget ?? step.target;
    const confidence = finding ? clamp01(finding.recommendedScore) : 0.5;

    if (step.action === "fill") {
      out.push({
        index: originalIndex,
        afterAction: step.action,
        candidate: { action: "assertValue", target, value: step.text },
        confidence: Math.max(0.7, confidence),
        rationale: "Filled input values are stable candidates for value assertions.",
        candidateSource: "deterministic",
      });
      continue;
    }

    if (step.action === "select") {
      out.push({
        index: originalIndex,
        afterAction: step.action,
        candidate: { action: "assertValue", target, value: step.value },
        confidence: Math.max(0.7, confidence),
        rationale: "Selected options can be validated with an assertValue step.",
        candidateSource: "deterministic",
      });
      continue;
    }

    if (step.action === "check" || step.action === "uncheck") {
      out.push({
        index: originalIndex,
        afterAction: step.action,
        candidate: {
          action: "assertChecked",
          target,
          checked: step.action === "check",
        },
        confidence: Math.max(0.75, confidence),
        rationale: "Check state transitions map directly to assertChecked.",
        candidateSource: "deterministic",
      });
      continue;
    }

    if (
      step.action === "click" ||
      step.action === "press" ||
      step.action === "hover"
    ) {
      out.push({
        index: originalIndex,
        afterAction: step.action,
        candidate: {
          action: "assertVisible",
          target,
        },
        confidence: COVERAGE_FALLBACK_CONFIDENCE,
        rationale:
          "Coverage fallback: verify interacted element remains visible after action.",
        candidateSource: "deterministic",
        coverageFallback: true,
      });
    }
  }

  return out;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
