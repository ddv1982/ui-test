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
  const match = /name:\s*'([^']*)'|name:\s*"([^"]*)"/.exec(targetValue);
  return match?.[1] ?? match?.[2];
}

/** Check whether a target value references a known CMP selector.
 *  Only matches against CSS/xpath/playwrightSelector kinds to avoid
 *  false positives from accessible names that happen to contain selector-like substrings. */
function matchesCmpSelector(targetValue: string, targetKind: string): boolean {
  if (targetKind === "locatorExpression") return false;
  const lower = targetValue.toLowerCase();
  return COOKIE_CONSENT_CMP_SELECTORS.some((selector) =>
    lower.includes(selector.toLowerCase())
  );
}

export type RuntimeFailureDisposition = "remove" | "retain";
export type RuntimeFailureMutationSafety =
  | "safe"
  | "review_required"
  | "unsafe_to_auto_apply";

export interface RuntimeFailureClassification {
  disposition: RuntimeFailureDisposition;
  reason: string;
  decisionConfidence: number;
  mutationSafety: RuntimeFailureMutationSafety;
  evidenceRefs: string[];
}

export function classifyRuntimeFailingStep(
  step: Step
): RuntimeFailureClassification {
  if (step.action === "navigate") {
    return makeClassification("retain", "navigation steps are never auto-removed", {
      decisionConfidence: 1,
      mutationSafety: "safe",
      evidenceRefs: ["action:navigate"],
    });
  }

  const isInteraction = step.action === "click" || step.action === "press";
  if (!isInteraction) {
    return makeClassification(
      "retain",
      "non-interaction steps are never auto-removed by transient policy",
      {
        decisionConfidence: 1,
        mutationSafety: "safe",
        evidenceRefs: [`action:${step.action}`],
      }
    );
  }

  // --- Early cookie-consent detection via shared patterns ---
  const targetValue = "target" in step ? step.target.value : "";

  const accessibleName = extractAccessibleName(targetValue);
  if (accessibleName && isCookieConsentDismissText(accessibleName)) {
    return makeClassification(
      "remove",
      "classified as cookie-consent dismiss interaction (multilingual pattern match)",
      {
        decisionConfidence: 0.98,
        mutationSafety: "safe",
        evidenceRefs: ["pattern:cookie_consent_text", `accessible_name:${accessibleName}`],
      }
    );
  }

  const targetKind = "target" in step ? step.target.kind : "unknown";
  if (matchesCmpSelector(targetValue, targetKind)) {
    return makeClassification("remove", "classified as cookie-consent CMP selector interaction", {
      decisionConfidence: 0.97,
      mutationSafety: "safe",
      evidenceRefs: ["pattern:cmp_selector", `target_kind:${targetKind}`],
    });
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
    return makeClassification("retain", "classified as non-transient interaction", {
      decisionConfidence: 0.93,
      mutationSafety: "safe",
      evidenceRefs: ["context:non_transient"],
    });
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
    return makeClassification(
      "retain",
      "transient-context safeguard: likely content link interaction",
      {
        decisionConfidence: 0.9,
        mutationSafety: "review_required",
        evidenceRefs: ["safeguard:content_link", "role:link"],
      }
    );
  }

  if (hasBusinessIntent && !hasStrongTransientContext) {
    return makeClassification(
      "retain",
      "transient-context safeguard: likely business-intent interaction",
      {
        decisionConfidence: 0.88,
        mutationSafety: "review_required",
        evidenceRefs: ["safeguard:business_intent"],
      }
    );
  }

  if (hasStrongTransientContext && (hasDismissIntent || hasControlCue)) {
    return makeClassification("remove", "classified as transient dismissal/control interaction", {
      decisionConfidence: 0.92,
      mutationSafety: "safe",
      evidenceRefs: [
        "context:strong_transient",
        hasDismissIntent ? "signal:dismiss_intent" : "signal:no_dismiss_intent",
        hasControlCue ? "signal:control_cue" : "signal:no_control_cue",
      ],
    });
  }

  if (hasStrongTransientContext) {
    return makeClassification("remove", "classified as strong transient-context interaction", {
      decisionConfidence: 0.78,
      mutationSafety: "review_required",
      evidenceRefs: ["context:strong_transient"],
    });
  }

  if (hasDismissIntent && hasControlCue) {
    return makeClassification(
      "remove",
      "classified as soft transient dismissal/control interaction",
      {
        decisionConfidence: 0.72,
        mutationSafety: "unsafe_to_auto_apply",
        evidenceRefs: ["context:soft_transient", "signal:dismiss_intent", "signal:control_cue"],
      }
    );
  }

  return makeClassification("retain", "transient context without dismissal/control confidence", {
    decisionConfidence: 0.74,
    mutationSafety: "review_required",
    evidenceRefs: ["context:soft_transient", "signal:insufficient_confidence"],
  });
}

function makeClassification(
  disposition: RuntimeFailureDisposition,
  reason: string,
  extras: {
    decisionConfidence: number;
    mutationSafety: RuntimeFailureMutationSafety;
    evidenceRefs: string[];
  }
): RuntimeFailureClassification {
  return {
    disposition,
    reason,
    decisionConfidence: extras.decisionConfidence,
    mutationSafety: extras.mutationSafety,
    evidenceRefs: extras.evidenceRefs,
  };
}
