import type { AssertionCandidate, StepFinding } from "./report-schema.js";
import type { Step, Target } from "../yaml-schema.js";
import {
  assessTargetDynamics,
  extractTargetTextFragments,
} from "./dynamic-target.js";

const COVERAGE_FALLBACK_CONFIDENCE = 0.76;

function getStepTarget(step: Step): Target | undefined {
  if ("target" in step && step.target) {
    return step.target;
  }
  return undefined;
}

export interface DeterministicAssertionSkip {
  index: number;
  reason: string;
}

export function buildAssertionCandidates(
  steps: Step[],
  findings: StepFinding[],
  originalStepIndexes?: number[]
): {
  candidates: AssertionCandidate[];
  skippedNavigationLikeClicks: DeterministicAssertionSkip[];
} {
  const byIndex = new Map<number, StepFinding>();
  for (const finding of findings) {
    byIndex.set(finding.index, finding);
  }

  const out: AssertionCandidate[] = [];
  const skippedNavigationLikeClicks: DeterministicAssertionSkip[] = [];

  for (const [index, step] of steps.entries()) {
    if (step.action === "navigate") continue;

    const stepTarget = getStepTarget(step);
    if (!stepTarget) continue;

    const originalIndex = originalStepIndexes?.[index] ?? index;
    const finding = byIndex.get(originalIndex);
    const target = finding?.recommendedTarget ?? stepTarget;
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
      const navigationLikeReason = classifyNavigationLikeInteraction(step, target);
      if (navigationLikeReason) {
        skippedNavigationLikeClicks.push({
          index: originalIndex,
          reason: navigationLikeReason,
        });
        continue;
      }
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

  return { candidates: out, skippedNavigationLikeClicks };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function classifyNavigationLikeInteraction(step: Step, target: Target): string | undefined {
  if (step.action !== "click" && step.action !== "press" && step.action !== "hover") {
    return undefined;
  }

  const targetValue = target.value;
  const isRoleLink = /getByRole\(\s*['"]link['"]/.test(targetValue);
  const hasExact = /exact\s*:\s*true/.test(targetValue);
  const hasContentCardPattern =
    /headline|teaser|article|story|content[-_ ]?card|breaking[-_ ]?push|hero[-_ ]?card/i.test(
      targetValue
    );

  const { dynamicSignals } = assessTargetDynamics(target);
  const queryTexts = extractTargetTextFragments(target);
  const hasHeadlineLikeText =
    queryTexts.some((text) => text.length >= 48) ||
    dynamicSignals.includes("contains_headline_like_text") ||
    dynamicSignals.includes("contains_weather_or_news_fragment") ||
    dynamicSignals.includes("contains_pipe_separator") ||
    dynamicSignals.includes("contains_date_or_time_fragment");

  if ((isRoleLink && hasHeadlineLikeText) || (isRoleLink && hasExact) || hasContentCardPattern) {
    return "navigation-like dynamic click target";
  }

  return undefined;
}
