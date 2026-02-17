import type { BrowserContext } from "playwright";

const COOKIE_BANNER_DISMISS_SCRIPT = `
(function() {
  var SELECTORS = [
    // OneTrust
    '#onetrust-accept-btn-handler',
    // Cookiebot / Usercentrics (Cookiebot)
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    // Didomi
    '#didomi-notice-agree-button',
    '.didomi-continue-without-agreeing',
    // Osano
    '.osano-cm-accept-all',
    // CookieYes
    '.cky-btn-accept',
    '#cookie_action_close_header',
    // CookieConsent (Insites)
    '.cc-accept', '.cc-allow', '.cc-dismiss-button',
    // Klaro
    '.cm-btn-accept', '.cm-btn-accept-all',
    // Complianz (WordPress)
    '.cmplz-accept',
    // TrustArc / TRUSTe
    '.trustarc-agree-btn',
    '#truste-consent-button',
    // Iubenda
    '.iubenda-cs-accept-btn',
    // Termly
    '.termly-consent-accept',
    // HubSpot
    '#hs-eu-confirmation-button',
    // consentmanager.net
    '#cmpbntyestxt',
    '.cmp-button-accept',
    // Sourcepoint
    '.sp_choice_type_11',
    // Borlabs Cookie (WordPress)
    '.BorlabsCookie ._brlbs-btn-accept-all',
    // Moove GDPR (WordPress)
    '.moove-gdpr-infobar-allow-all',
    // CIVIC Cookie Control
    '.ccc-accept-settings',
    // Generic selectors
    '#cookie-accept', '#accept-cookies', '#consent-accept',
    '[data-testid="cookie-accept"]',
    '[data-action="accept-cookies"]',
    'button[class*="cookie"][class*="accept"]',
    'button[class*="consent"][class*="accept"]',
    '.cookie-consent-accept', '.consent-accept',
    '#gdpr-accept', '.gdpr-accept',
  ];

  // Multilingual patterns for fallback text matching (anchored to avoid false positives)
  var ACCEPT_PATTERNS = /^(accept|agree|allow|ok|got it|i agree|accept all|allow all|accept cookies|akkoord|accepteren|alle cookies accepteren|alles accepteren|cookies toestaan|akzeptieren|alle akzeptieren|einverstanden|zustimmen|accepter|accepter alle|j['\u2019]accepte|tout accepter|aceptar|aceptar todo|acepto|accetta|accetta tutto|accetto|aceitar|aceitar tudo|aceito|acceptera|godk[\u00e4a]nn|godk[\u00e4a]nn alla|aksepter|godta alle|hyv[\u00e4a]ksy|hyv[\u00e4a]ksy kaikki|akceptuj|akceptuj wszystkie|elfogadom|p\u0159ijmout|p\u0159ijmout v\u0161e)$/i;

  var dismissed = false;

  function tryDismiss() {
    if (dismissed) return true;
    for (var i = 0; i < SELECTORS.length; i++) {
      try {
        var el = document.querySelector(SELECTORS[i]);
        if (el && el.offsetParent !== null) {
          el.click();
          dismissed = true;
          return true;
        }
      } catch (e) { /* ignore */ }
    }
    // Fallback: text matching inside cookie/consent containers
    var containers = document.querySelectorAll(
      '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="gdpr"], [id*="gdpr"], [class*="cmp-"], [id*="cmp-"], [class*="cmp_"], [id*="cmp_"], [role="dialog"], [role="alertdialog"]'
    );
    for (var c = 0; c < containers.length; c++) {
      var buttons = containers[c].querySelectorAll('button, [role="button"], a');
      for (var b = 0; b < buttons.length; b++) {
        var text = (buttons[b].textContent || '').trim();
        if (ACCEPT_PATTERNS.test(text)) {
          buttons[b].click();
          dismissed = true;
          return true;
        }
      }
    }
    return false;
  }

  function init() { setTimeout(tryDismiss, 200); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var observer = new MutationObserver(function() {
    if (tryDismiss()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function() { observer.disconnect(); }, 10000);
})();
`;

export async function installCookieBannerDismisser(context: BrowserContext): Promise<void> {
  await context.addInitScript(COOKIE_BANNER_DISMISS_SCRIPT);
}
