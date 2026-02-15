import { chromium } from "playwright";
import { UserError } from "./errors.js";

export const CHROMIUM_INSTALL_HINT =
  "Run: ui-test setup quickstart or npx playwright install chromium";

export function isLikelyMissingChromium(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("executable doesn't exist") ||
    normalized.includes("browserType.launch".toLowerCase()) ||
    normalized.includes("please run the following command to download new browsers") ||
    normalized.includes("playwright install")
  );
}

export function chromiumNotInstalledError(): UserError {
  return new UserError("Chromium browser is not installed.", CHROMIUM_INSTALL_HINT);
}

export async function ensureChromiumAvailable(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isLikelyMissingChromium(message)) {
      throw chromiumNotInstalledError();
    }
    throw err;
  }
}
