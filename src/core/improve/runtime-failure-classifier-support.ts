import {
  isCookieConsentDismissText,
  COOKIE_CONSENT_CMP_SELECTORS,
} from "../runtime/cookie-consent-patterns.js";

export const STRONG_TRANSIENT_CONTEXT_KEYWORDS = [
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
  "venster",
  "melding",
  "einwilligung",
  "consentement",
] as const;

export const SOFT_TRANSIENT_CONTEXT_KEYWORDS = [
  "privacy",
  "preference",
  "preferences",
  "tracking",
] as const;

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
] as const;

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
] as const;

export interface RuntimeFailureSignals {
  targetValue: string;
  targetKind: string;
  accessibleName?: string;
  stepText: string;
  hasStrongTransientContext: boolean;
  hasSoftTransientContext: boolean;
  hasAnyTransientContext: boolean;
  hasDismissIntent: boolean;
  targetsRoleLink: boolean;
  targetsRoleButton: boolean;
  looksLikeContentLink: boolean;
  hasBusinessIntent: boolean;
  hasControlCue: boolean;
}

export function extractAccessibleName(targetValue: string): string | undefined {
  const match = /name:\s*'([^']*)'|name:\s*"([^"]*)"/.exec(targetValue);
  return match?.[1] ?? match?.[2];
}

export function matchesCmpSelector(targetValue: string, targetKind: string): boolean {
  if (targetKind === "locatorExpression") return false;
  const lower = targetValue.toLowerCase();
  return COOKIE_CONSENT_CMP_SELECTORS.some((selector) =>
    lower.includes(selector.toLowerCase())
  );
}

export function detectCookieConsentDismiss(
  targetValue: string,
  targetKind: string
): { matched: boolean; accessibleName?: string; via: "text" | "cmp_selector" | null } {
  const accessibleName = extractAccessibleName(targetValue);
  if (accessibleName && isCookieConsentDismissText(accessibleName)) {
    return { matched: true, accessibleName, via: "text" };
  }
  if (matchesCmpSelector(targetValue, targetKind)) {
    return { matched: true, via: "cmp_selector" };
  }
  return accessibleName === undefined
    ? { matched: false, via: null }
    : { matched: false, accessibleName, via: null };
}

export function buildRuntimeFailureSignals(input: {
  targetValue: string;
  targetKind: string;
  description?: string;
}): RuntimeFailureSignals {
  const accessibleName = extractAccessibleName(input.targetValue);
  const stepText = `${input.targetValue} ${input.description ?? ""}`.toLowerCase();
  const hasStrongTransientContext = STRONG_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasSoftTransientContext = SOFT_TRANSIENT_CONTEXT_KEYWORDS.some((keyword) =>
    stepText.includes(keyword)
  );
  const hasAnyTransientContext = hasStrongTransientContext || hasSoftTransientContext;
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

  return {
    targetValue: input.targetValue,
    targetKind: input.targetKind,
    stepText,
    hasStrongTransientContext,
    hasSoftTransientContext,
    hasAnyTransientContext,
    hasDismissIntent,
    targetsRoleLink,
    targetsRoleButton,
    looksLikeContentLink,
    hasBusinessIntent,
    hasControlCue,
    ...(accessibleName !== undefined ? { accessibleName } : {}),
  };
}
