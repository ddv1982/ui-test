/**
 * Shared multilingual cookie-consent patterns.
 *
 * Extracted from cookie-banner.ts so the runtime-failure-classifier (and
 * any future consumer) can recognise cookie-consent interactions without
 * duplicating the list of CMP selectors and accept-button texts.
 */

/** CSS selectors for well-known Consent Management Platforms (CMPs). */
export const COOKIE_CONSENT_CMP_SELECTORS: readonly string[] = [
  // OneTrust
  "#onetrust-accept-btn-handler",
  // Cookiebot / Usercentrics
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#CybotCookiebotDialogBodyButtonAccept",
  // Didomi
  "#didomi-notice-agree-button",
  ".didomi-continue-without-agreeing",
  // Osano
  ".osano-cm-accept-all",
  // CookieYes
  ".cky-btn-accept",
  "#cookie_action_close_header",
  // CookieConsent (Insites)
  ".cc-accept",
  ".cc-allow",
  ".cc-dismiss-button",
  // Klaro
  ".cm-btn-accept",
  ".cm-btn-accept-all",
  // Complianz (WordPress)
  ".cmplz-accept",
  // TrustArc / TRUSTe
  ".trustarc-agree-btn",
  "#truste-consent-button",
  // Iubenda
  ".iubenda-cs-accept-btn",
  // Termly
  ".termly-consent-accept",
  // HubSpot
  "#hs-eu-confirmation-button",
  // consentmanager.net
  "#cmpbntyestxt",
  ".cmp-button-accept",
  // Sourcepoint
  ".sp_choice_type_11",
  // Borlabs Cookie (WordPress)
  ".BorlabsCookie ._brlbs-btn-accept-all",
  // Moove GDPR (WordPress)
  ".moove-gdpr-infobar-allow-all",
  // CIVIC Cookie Control
  ".ccc-accept-settings",
  // Generic selectors
  "#cookie-accept",
  "#accept-cookies",
  "#consent-accept",
  '[data-testid="cookie-accept"]',
  '[data-action="accept-cookies"]',
  'button[class*="cookie"][class*="accept"]',
  'button[class*="consent"][class*="accept"]',
  ".cookie-consent-accept",
  ".consent-accept",
  "#gdpr-accept",
  ".gdpr-accept",
];

/**
 * Multilingual accept/dismiss button texts used by cookie banners.
 *
 * Every entry is **lowercase**; callers must normalise before comparing.
 * Sourced from the ACCEPT_PATTERNS regex in cookie-banner.ts.
 */
export const COOKIE_CONSENT_DISMISS_TEXTS: readonly string[] = [
  // English
  "accept",
  "agree",
  "allow",
  "ok",
  "got it",
  "i agree",
  "accept all",
  "allow all",
  "accept cookies",
  // Dutch
  "akkoord",
  "accepteren",
  "alle cookies accepteren",
  "alles accepteren",
  "cookies toestaan",
  // German
  "akzeptieren",
  "alle akzeptieren",
  "einverstanden",
  "zustimmen",
  // French
  "accepter",
  "accepter alle",
  "j'accepte",
  "j\u2019accepte",
  "tout accepter",
  // Spanish
  "aceptar",
  "aceptar todo",
  "acepto",
  // Italian
  "accetta",
  "accetta tutto",
  "accetto",
  // Portuguese
  "aceitar",
  "aceitar tudo",
  "aceito",
  // Swedish
  "acceptera",
  "godkänn",
  "godkänn alla",
  "godkann",
  "godkann alla",
  // Norwegian
  "aksepter",
  "godta alle",
  // Finnish
  "hyväksy",
  "hyväksy kaikki",
  "hyvaksy",
  "hyvaksy kaikki",
  // Polish
  "akceptuj",
  "akceptuj wszystkie",
  // Hungarian
  "elfogadom",
  // Czech
  "přijmout",
  "přijmout vše",
  "prijmout",
  "prijmout vse",
];

const dismissTextSet = new Set(COOKIE_CONSENT_DISMISS_TEXTS);

/**
 * Case-insensitive exact-match check against known cookie-consent dismiss
 * button texts.
 */
export function isCookieConsentDismissText(text: string): boolean {
  return dismissTextSet.has(text.trim().toLowerCase());
}
