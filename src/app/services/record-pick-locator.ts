import {
  chromium,
  devices,
  firefox,
  selectors,
  webkit,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "playwright";
import type { RecordBrowser } from "../../core/recorder.js";

export interface PickLocatorOptions {
  url: string;
  browser: RecordBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export async function pickLocatorInteractively(options: PickLocatorOptions): Promise<string> {
  if (options.testIdAttribute?.trim()) {
    selectors.setTestIdAttribute(options.testIdAttribute.trim());
  }

  const browserInstance = await resolveBrowserType(options.browser).launch({ headless: false });
  let context: BrowserContext | undefined;

  try {
    context = await browserInstance.newContext(buildContextOptions(options));
    const page = await context.newPage();
    await page.goto(options.url);

    const locatorExpression = await pickLocatorOnPage(page);

    if (options.saveStorage?.trim()) {
      await context.storageState({ path: options.saveStorage.trim() });
    }

    return locatorExpression;
  } finally {
    await context?.close().catch(() => {});
    await browserInstance.close().catch(() => {});
  }
}

function resolveBrowserType(browser: RecordBrowser) {
  if (browser === "firefox") return firefox;
  if (browser === "webkit") return webkit;
  return chromium;
}

function buildContextOptions(options: PickLocatorOptions): BrowserContextOptions {
  const contextOptions: BrowserContextOptions = {};
  const deviceDescriptor = options.device ? devices[options.device] : undefined;

  if (deviceDescriptor) {
    Object.assign(contextOptions, deviceDescriptor);
  }

  if (options.loadStorage?.trim()) {
    contextOptions.storageState = options.loadStorage.trim();
  }

  return contextOptions;
}

async function pickLocatorOnPage(page: Page): Promise<string> {
  const locatorExpression = page.pickLocator().then((locator) => locator.toString().trim());
  const picked = await locatorExpression;

  if (picked.length > 0) {
    return picked;
  }

  throw new Error("Pick Locator returned an empty locator.");
}

export { buildContextOptions };
