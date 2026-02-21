import { chromium, type Browser, type Page } from "playwright";
import { chromiumNotInstalledError, isLikelyMissingBrowser } from "../../utils/chromium-runtime.js";
import { installCookieBannerDismisser } from "../runtime/cookie-banner.js";

export async function launchImproveBrowser(): Promise<{ browser: Browser; page: Page }> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await installCookieBannerDismisser(context);
    const page = await context.newPage();
    return { browser, page };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await browser?.close().catch(() => {});
    if (isLikelyMissingBrowser(message)) {
      throw chromiumNotInstalledError();
    }
    throw err;
  }
}
