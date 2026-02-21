import type { Browser, LaunchOptions } from "playwright";

export type PlaywrightBrowser = "chromium" | "firefox" | "webkit";

export interface BrowserLauncher {
  launch(options?: LaunchOptions): Promise<Browser>;
}

export type BrowserLaunchers = Record<PlaywrightBrowser, BrowserLauncher>;
