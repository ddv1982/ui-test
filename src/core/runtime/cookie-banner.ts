import type { BrowserContext, Frame, Page } from "playwright";
import {
  COOKIE_CONSENT_CMP_SELECTORS,
  COOKIE_CONSENT_DISMISS_TEXTS,
} from "./cookie-consent-patterns.js";

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDismissScript(): string {
  const selectorsJson = JSON.stringify([...COOKIE_CONSENT_CMP_SELECTORS]);
  const pattern = COOKIE_CONSENT_DISMISS_TEXTS
    .map((text) => escapeForRegex(text))
    .join("|");

  return `
(function() {
  var SELECTORS = ${selectorsJson};

  var ACCEPT_PATTERNS = /^(${pattern})$/i;
  var CONSENT_CONTEXT_PATTERN = /(cookie|consent|gdpr|cmp)/i;
  var CONSENT_HOST_PATTERN = /(myprivacy\\.|onetrust|cookiebot|didomi|trustarc)/i;

  var dismissed = false;

  function readControlText(control) {
    if (!control) return '';
    var aria = '';
    try {
      aria =
        control.getAttribute('aria-label') ||
        control.getAttribute('title') ||
        control.getAttribute('value') ||
        '';
    } catch (e) { /* ignore */ }
    var text = (aria || control.textContent || '').trim();
    return text;
  }

  function clickMatchingControl(controls) {
    for (var i = 0; i < controls.length; i++) {
      var control = controls[i];
      if (!isInteractableControl(control)) continue;
      var text = readControlText(control);
      if (!ACCEPT_PATTERNS.test(text)) continue;
      try {
        control.click();
        dismissed = true;
        return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  function collectRoots(root, out) {
    out.push(root);
    var nodes = [];
    try {
      nodes = root.querySelectorAll('*');
    } catch (e) { /* ignore */ }
    for (var i = 0; i < nodes.length; i++) {
      var shadowRoot = nodes[i].shadowRoot;
      if (shadowRoot) {
        collectRoots(shadowRoot, out);
      }
    }
  }

  function readNodeHints(node) {
    if (!node) return '';
    var parts = [];
    try { parts.push(node.id || ''); } catch (e) { /* ignore */ }
    try { parts.push(node.className || ''); } catch (e) { /* ignore */ }
    try { parts.push(node.getAttribute('role') || ''); } catch (e) { /* ignore */ }
    try { parts.push(node.getAttribute('aria-label') || ''); } catch (e) { /* ignore */ }
    try { parts.push(node.getAttribute('data-testid') || ''); } catch (e) { /* ignore */ }
    try { parts.push(node.getAttribute('data-cmp') || ''); } catch (e) { /* ignore */ }
    try { parts.push((node.textContent || '').slice(0, 600)); } catch (e) { /* ignore */ }
    return parts.join(' ').trim();
  }

  function hasConsentContext() {
    try {
      var host = String((window.location && window.location.hostname) || '');
      if (CONSENT_HOST_PATTERN.test(host)) {
        return true;
      }
    } catch (e) { /* ignore */ }

    try {
      var marker = document.querySelector(
        '[id*="consent"], [class*="consent"], [id*="cookie"], [class*="cookie"], [id*="gdpr"], [class*="gdpr"], [data-testid*="consent"], [data-testid*="cookie"], [data-cmp]'
      );
      if (marker) return true;
    } catch (e) { /* ignore */ }

    return false;
  }

  function containerLooksConsentRelated(container) {
    return CONSENT_CONTEXT_PATTERN.test(readNodeHints(container));
  }

  function isInteractableControl(control) {
    if (!control) return false;
    try {
      if (control.disabled === true) return false;
    } catch (e) { /* ignore */ }
    try {
      var ariaDisabled = String(control.getAttribute('aria-disabled') || '').toLowerCase();
      if (ariaDisabled === 'true') return false;
    } catch (e) { /* ignore */ }
    try {
      var rects = control.getClientRects ? control.getClientRects() : null;
      if (!rects || rects.length === 0) return false;
    } catch (e) { /* ignore */ }
    try {
      var style = window.getComputedStyle ? window.getComputedStyle(control) : null;
      if (style) {
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (style.pointerEvents === 'none') return false;
        if (Number(style.opacity || '1') === 0) return false;
      }
    } catch (e) { /* ignore */ }
    return true;
  }

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
      '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="gdpr"], [id*="gdpr"], [class*="cmp-"], [id*="cmp-"], [class*="cmp_"], [id*="cmp_"]'
    );
    for (var c = 0; c < containers.length; c++) {
      if (!containerLooksConsentRelated(containers[c])) continue;
      var buttons = containers[c].querySelectorAll('button, [role="button"], a');
      if (clickMatchingControl(buttons)) return true;
    }

    // Final fallback: global control scan, including open shadow roots.
    if (!hasConsentContext()) return false;
    var roots = [];
    collectRoots(document, roots);
    for (var r = 0; r < roots.length; r++) {
      var controls = [];
      try {
        controls = roots[r].querySelectorAll(
          'button, [role="button"], a, input[type="button"], input[type="submit"]'
        );
      } catch (e) { /* ignore */ }
      if (clickMatchingControl(controls)) {
        return true;
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
}

const COOKIE_BANNER_DISMISS_SCRIPT = buildDismissScript();
const CONSENT_HOST_HINT_PATTERN = /(myprivacy\.|onetrust|cookiebot|didomi|trustarc)/i;
const CONSENT_CONTEXT_SELECTOR =
  '[id*="consent"], [class*="consent"], [id*="cookie"], [class*="cookie"], [id*="gdpr"], [class*="gdpr"], [data-testid*="consent"], [data-testid*="cookie"], [data-cmp]';
const ACCEPT_NAME_PATTERN = new RegExp(
  "^\\s*(?:" +
    COOKIE_CONSENT_DISMISS_TEXTS.map((text) => escapeForRegex(text)).join("|") +
    ")\\s*$",
  "i"
);

export async function installCookieBannerDismisser(context: BrowserContext): Promise<void> {
  await context.addInitScript(COOKIE_BANNER_DISMISS_SCRIPT);
}

export async function dismissCookieBannerIfPresent(
  page: Page,
  timeoutMs = 1200
): Promise<boolean> {
  const result = await dismissCookieBannerWithDetails(page, timeoutMs);
  return result.dismissed;
}

export interface CookieBannerDismissResult {
  dismissed: boolean;
  strategy?: "known_selector" | "text_match";
  frameUrl?: string;
}

export async function dismissCookieBannerWithDetails(
  page: Page,
  timeoutMs = 1200
): Promise<CookieBannerDismissResult> {
  if (!page || typeof page.frames !== "function") return { dismissed: false };
  const timeout = clampDismissTimeout(timeoutMs);
  const frames = page.frames();

  for (const frame of frames) {
    if (await clickKnownCmpSelector(frame, timeout)) {
      return {
        dismissed: true,
        strategy: "known_selector",
        frameUrl: frame.url(),
      };
    }
  }

  for (const frame of frames) {
    if (!(await isLikelyConsentFrame(frame, timeout))) continue;
    if (await clickConsentControlByText(frame, timeout)) {
      return {
        dismissed: true,
        strategy: "text_match",
        frameUrl: frame.url(),
      };
    }
  }

  return { dismissed: false };
}

function clampDismissTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 1200;
  if (timeoutMs < 250) return 250;
  if (timeoutMs > 2000) return 2000;
  return timeoutMs;
}

async function clickKnownCmpSelector(frame: Frame, timeout: number): Promise<boolean> {
  const probeTimeout = Math.min(timeout, 400);
  for (const selector of COOKIE_CONSENT_CMP_SELECTORS) {
    const locator = frame.locator(selector).first();
    const visible = await locator.isVisible({ timeout: probeTimeout }).catch(() => false);
    if (!visible) continue;
    const clicked = await locator.click({ timeout }).then(() => true).catch(() => false);
    if (clicked) return true;
  }
  return false;
}

async function isLikelyConsentFrame(frame: Frame, timeout: number): Promise<boolean> {
  const url = frame.url();
  if (CONSENT_HOST_HINT_PATTERN.test(readHostname(url))) {
    return true;
  }

  const markerVisible = await frame
    .locator(CONSENT_CONTEXT_SELECTOR)
    .first()
    .isVisible({ timeout: Math.min(timeout, 400) })
    .catch(() => false);
  if (markerVisible) return true;

  return false;
}

function readHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function clickConsentControlByText(frame: Frame, timeout: number): Promise<boolean> {
  const probeTimeout = Math.min(timeout, 450);
  const roleCandidates: Array<"button" | "link"> = ["button", "link"];

  for (const role of roleCandidates) {
    const locator = frame.getByRole(role, { name: ACCEPT_NAME_PATTERN });
    const count = await locator.count().catch(() => 0);
    const boundedCount = Math.min(count, 6);
    for (let index = 0; index < boundedCount; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible({ timeout: probeTimeout }).catch(() => false);
      if (!visible) continue;
      const clicked = await candidate.click({ timeout }).then(() => true).catch(() => false);
      if (clicked) return true;
    }
  }

  const inputLocator = frame.locator(
    'input[type="button"], input[type="submit"]'
  );
  const inputCount = await inputLocator.count().catch(() => 0);
  const boundedInputCount = Math.min(inputCount, 6);
  for (let index = 0; index < boundedInputCount; index += 1) {
    const candidate = inputLocator.nth(index);
    const visible = await candidate.isVisible({ timeout: probeTimeout }).catch(() => false);
    if (!visible) continue;
    const value = await candidate.getAttribute("value").catch(() => "") ?? "";
    if (!ACCEPT_NAME_PATTERN.test(value.trim())) continue;
    const clicked = await candidate.click({ timeout }).then(() => true).catch(() => false);
    if (clicked) return true;
  }

  return false;
}

const OVERLAY_INTERCEPTION_PATTERNS = [
  /intercepts pointer events/i,
  /subtree intercepts pointer events/i,
  /another element would receive the click/i,
  /element is obscured/i,
  /element is not visible/i,
];

export function isLikelyOverlayInterceptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return OVERLAY_INTERCEPTION_PATTERNS.some((pattern) => pattern.test(message));
}
