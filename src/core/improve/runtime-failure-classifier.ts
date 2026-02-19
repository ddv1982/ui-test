import type { Step } from "../yaml-schema.js";
import {
  isCookieConsentDismissText,
  COOKIE_CONSENT_CMP_SELECTORS,
} from "../runtime/cookie-consent-patterns.js";

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
  // Multilingual additions
  "venster",        // Dutch: window/popup
  "melding",        // Dutch: notification
  "einwilligung",   // German: consent
  "consentement",   // French: consent
];

const SOFT_TRANSIENT_CONTEXT_KEYWORDS = [
  "privacy",
  "preference",
  "preferences",
  "tracking",
];

const DISMISS_INTENT_PATTERN =
  /\b(close|dismiss|accept|agree|allow|reject|decline|continue|ok|got it|sluiten|sluit|annuleren|overslaan|doorgaan|schliessen|abbrechen|weiter|fermer|annuler|continuer|cerrar|cancelar|continuar)\b/;

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

/** Extract the accessible name from a Playwright locator expression like
 *  `getByRole('button', { name: 'Akkoord' })` → `"Akkoord"`. */
function extractAccessibleName(targetValue: string): string | undefined {
  const match = /name:\s*['"]([^'"]+)['"]/.exec(targetValue);
  return match?.[1];
}

/** Check whether a target value references a known CMP selector. */
function matchesCmpSelector(targetValue: string): boolean {
  const lower = targetValue.toLowerCase();
  return COOKIE_CONSENT_CMP_SELECTORS.some((selector) =>
    lower.includes(selector.toLowerCase())
  );
}

export type RuntimeFailureDisposition = "remove" | "retain";

export interface RuntimeFailureClassification {
  disposition: RuntimeFailureDisposition;
  reason: string;
}

export function classifyRuntimeFailingStep(
  step: Step
): RuntimeFailureClassification {
  if (step.action === "navigate") {
    return {
      disposition: "retain",
      reason: "navigation steps are never auto-removed",
    };
  }

  const isInteraction = step.action === "click" || step.action === "press";
  if (!isInteraction) {
    return {
      disposition: "retain",
      reason: "non-interaction steps are never auto-removed by transient policy",
    };
  }

  // --- Early cookie-consent detection via shared patterns ---
  const targetValue = "target" in step ? step.target.value : "";

  const accessibleName = extractAccessibleName(targetValue);
  if (accessibleName && isCookieConsentDismissText(accessibleName)) {
    return {
      disposition: "remove",
      reason: "classified as cookie-consent dismiss interaction (multilingual pattern match)",
    };
  }

  if (matchesCmpSelector(targetValue)) {
    return {
      disposition: "remove",
      reason: "classified as cookie-consent CMP selector interaction",
    };
  }

  // --- Existing transient-context classification ---
  const stepText = `${targetValue} ${step.description ?? ""}`.toLowerCase();

  const hasStrongTransientContext = STRONG_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasSoftTransientContext = SOFT_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasAnyTransientContext = hasStrongTransientContext || hasSoftTransientContext;

  if (!hasAnyTransientContext) {
    return {
      disposition: "retain",
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
      disposition: "retain",
      reason: "transient-context safeguard: likely content link interaction",
    };
  }

  if (hasBusinessIntent && !hasStrongTransientContext) {
    return {
      disposition: "retain",
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
    disposition: "retain",
    reason: "transient context without dismissal/control confidence",
  };
}
