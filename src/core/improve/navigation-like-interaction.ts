import type { Step, Target } from "../yaml-schema.js";
import {
  assessTargetDynamics,
  extractTargetTextFragments,
} from "./dynamic-target.js";

function isNavigationLikeAction(action: Step["action"]): boolean {
  return action === "click" || action === "press" || action === "hover";
}

export function classifyNavigationLikeInteraction(
  step: Step,
  target: Target
): string | undefined {
  if (!isNavigationLikeAction(step.action)) return undefined;

  const targetValue = target.value;
  const isRoleLink = /getByRole\(\s*['"]link['"]/.test(targetValue);
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

  if ((isRoleLink && hasHeadlineLikeText) || hasContentCardPattern) {
    return "navigation-like dynamic click target";
  }

  return undefined;
}
