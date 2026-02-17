import type { BrowserContext } from "playwright";

const COOKIE_BANNER_DISMISS_SCRIPT = `
(function() {
  const SELECTORS = [
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    '.osano-cm-accept-all',
    '#cookie-accept', '#accept-cookies', '#consent-accept',
    '.cc-accept', '.cc-allow', '.cc-dismiss-button',
    '[data-testid="cookie-accept"]',
    '[data-action="accept-cookies"]',
    'button[class*="cookie"][class*="accept"]',
    'button[class*="consent"][class*="accept"]',
    '.cookie-consent-accept', '.consent-accept',
    '#gdpr-accept', '.gdpr-accept',
    '.termly-consent-accept',
    '.iubenda-cs-accept-btn',
  ];

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
      '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [role="dialog"]'
    );
    for (var c = 0; c < containers.length; c++) {
      var buttons = containers[c].querySelectorAll('button, [role="button"], a');
      for (var b = 0; b < buttons.length; b++) {
        var text = (buttons[b].textContent || '').trim();
        if (/^(accept|agree|allow|ok|got it|i agree)/i.test(text)) {
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
