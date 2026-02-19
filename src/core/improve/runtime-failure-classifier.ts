import type { Step } from "../yaml-schema.js";

const STRONG_TRANSIENT_CONTEXT_KEYWORDS = [
  "cookie",
  "consent",
  "gdpr",
  "onetrust",
  "banner",
  "popup",
  "modal",
  "dialog",
  "trustarc",
  "cookiebot",
  "cmp",
];

const SOFT_TRANSIENT_CONTEXT_KEYWORDS = [
  "privacy",
  "preference",
  "preferences",
  "tracking",
];

const DISMISS_INTENT_PATTERN =
  /\b(close|dismiss|accept|agree|allow|reject|decline|continue|ok|got it)\b/;

const CONTENT_LINK_HINTS = [
  "policy",
  "terms",
  "article",
  "nieuws",
  "news",
  "read",
  "learn",
  "details",
];

const BUSINESS_INTENT_HINTS = [
  "payment",
  "checkout",
  "purchase",
  "order",
  "billing",
  "invoice",
  "subscription",
  "account",
  "plan",
];

export type RuntimeFailureDisposition = "remove" | "optionalize";

export interface RuntimeFailureClassification {
  disposition: RuntimeFailureDisposition;
  reason: string;
}

export function classifyRuntimeFailingStep(
  step: Step
): RuntimeFailureClassification {
  if (step.action === "navigate") {
    return {
      disposition: "optionalize",
      reason: "navigation steps are never auto-removed",
    };
  }

  const isInteraction = step.action === "click" || step.action === "press";
  if (!isInteraction) {
    return {
      disposition: "optionalize",
      reason: "non-interaction steps are never auto-removed by transient policy",
    };
  }

  const stepText = `${"target" in step ? step.target.value : ""} ${
    step.description ?? ""
  }`.toLowerCase();

  const hasStrongTransientContext = STRONG_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasSoftTransientContext = SOFT_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasAnyTransientContext = hasStrongTransientContext || hasSoftTransientContext;

  if (!hasAnyTransientContext) {
    return {
      disposition: "optionalize",
      reason: "classified as non-transient interaction",
    };
  }

  const hasDismissIntent = DISMISS_INTENT_PATTERN.test(stepText);
  const targetsRoleLink = /getbyrole\(\s*['"]link['"]/.test(stepText);
  const targetsRoleButton = /getbyrole\(\s*['"]button['"]/.test(stepText);
  const looksLikeContentLink =
    targetsRoleLink &&
    CONTENT_LINK_HINTS.some((keyword) => stepText.includes(keyword)) &&
    !hasDismissIntent;
  const hasBusinessIntent = BUSINESS_INTENT_HINTS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasControlCue =
    targetsRoleButton ||
    /\b(cookie|consent|cmp|gdpr|onetrust|cookiebot|trustarc|banner|popup|modal|dialog)\b/.test(
      stepText
    );

  if (looksLikeContentLink) {
    return {
      disposition: "optionalize",
      reason: "transient-context safeguard: likely content link interaction",
    };
  }

  if (hasBusinessIntent && !hasStrongTransientContext) {
    return {
      disposition: "optionalize",
      reason: "transient-context safeguard: likely business-intent interaction",
    };
  }

  if (hasStrongTransientContext && (hasDismissIntent || hasControlCue)) {
    return {
      disposition: "remove",
      reason: "classified as transient dismissal/control interaction",
    };
  }

  if (hasStrongTransientContext) {
    return {
      disposition: "remove",
      reason: "classified as strong transient-context interaction",
    };
  }

  if (hasDismissIntent && hasControlCue) {
    return {
      disposition: "remove",
      reason: "classified as soft transient dismissal/control interaction",
    };
  }

  return {
    disposition: "optionalize",
    reason: "transient context without dismissal/control confidence",
  };
}
