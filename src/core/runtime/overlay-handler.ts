import type { Locator, Page } from "playwright";
import {
  dismissCookieBannerWithDetails,
  type CookieBannerDismissResult,
} from "./cookie-banner.js";

const CONSENT_HANDLER_TRIGGER_SELECTOR =
  '[id*="consent"], [class*="consent"], [id*="cookie"], [class*="cookie"], [id*="gdpr"], [class*="gdpr"], [data-testid*="consent"], [data-testid*="cookie"], [data-cmp]';
const NON_COOKIE_OVERLAY_TRIGGER_SELECTOR =
  '[role="dialog"][aria-modal="true"], .modal[aria-modal="true"], .modal--breaking-push, .breaking-push-modal';
const DEFAULT_HANDLER_TIMEOUT_MS = 1_200;
const MAX_HANDLER_TIMES = 50;

export interface OverlayHandlerEvent {
  category: NonNullable<CookieBannerDismissResult["category"]>;
  strategy?: CookieBannerDismissResult["strategy"];
  frameUrl?: string;
  source: "playwright_locator_handler";
}

export interface OverlayHandlerRegistration {
  dispose: () => Promise<void>;
}

interface OverlayHandlerDependencies {
  dismissOverlayFn?: typeof dismissCookieBannerWithDetails;
}

export async function installOverlayHandlers(
  page: Page,
  options: {
    timeoutMs?: number;
    onDismissed?: (event: OverlayHandlerEvent) => void;
  } = {},
  dependencies: OverlayHandlerDependencies = {}
): Promise<OverlayHandlerRegistration> {
  if (typeof page.addLocatorHandler !== "function") {
    return {
      dispose: async () => {},
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
  const dismissOverlayFn = dependencies.dismissOverlayFn ?? dismissCookieBannerWithDetails;
  const registeredLocators: Locator[] = [];

  const registerHandler = async (locator: Locator): Promise<void> => {
    await page.addLocatorHandler(
      locator,
      async () => {
        const dismissed = await dismissOverlayFn(page, timeoutMs).catch(
          () => ({ dismissed: false } as const)
        );
        if (!dismissed.dismissed || !dismissed.category) return;
        const event: OverlayHandlerEvent = {
          category: dismissed.category,
          source: "playwright_locator_handler",
        };
        if (dismissed.strategy !== undefined) {
          event.strategy = dismissed.strategy;
        }
        if (dismissed.frameUrl !== undefined) {
          event.frameUrl = dismissed.frameUrl;
        }
        options.onDismissed?.(event);
      },
      { noWaitAfter: true, times: MAX_HANDLER_TIMES }
    );
    registeredLocators.push(locator);
  };

  await registerHandler(page.locator(CONSENT_HANDLER_TRIGGER_SELECTOR));
  await registerHandler(page.locator(NON_COOKIE_OVERLAY_TRIGGER_SELECTOR));

  return {
    dispose: async () => {
      if (typeof page.removeLocatorHandler !== "function") return;
      for (const locator of registeredLocators) {
        try {
          await page.removeLocatorHandler(locator);
        } catch {
          // Best-effort cleanup only.
        }
      }
    },
  };
}

export function formatOverlayHandlerEvent(event: OverlayHandlerEvent): string {
  const categoryLabel =
    event.category === "non_cookie_overlay" ? "non-cookie overlay" : "cookie banner";
  const via = event.strategy ?? "unknown";
  const suffix = event.frameUrl ? ` (${event.frameUrl})` : "";
  return `Playwright overlay handler dismissed ${categoryLabel} via ${via}${suffix}.`;
}
