import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  chromiumLaunchMock,
  firefoxLaunchMock,
  webkitLaunchMock,
  setTestIdAttributeMock,
} = vi.hoisted(() => ({
  chromiumLaunchMock: vi.fn(),
  firefoxLaunchMock: vi.fn(),
  webkitLaunchMock: vi.fn(),
  setTestIdAttributeMock: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
  firefox: {
    launch: firefoxLaunchMock,
  },
  webkit: {
    launch: webkitLaunchMock,
  },
  devices: {
    "Pixel 5": {
      viewport: { width: 393, height: 851 },
      userAgent: "pixel-5",
      isMobile: true,
      hasTouch: true,
      defaultBrowserType: "chromium",
    },
  },
  selectors: {
    setTestIdAttribute: setTestIdAttributeMock,
  },
}));

import { buildContextOptions, pickLocatorInteractively } from "./record-pick-locator.js";

describe("pickLocatorInteractively", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("picks a locator and threads through browser context settings", async () => {
    const storageStateMock = vi.fn(async () => {});
    const page = {
      goto: vi.fn(async () => {}),
      pickLocator: vi.fn(async () => ({
        toString: (): string => "getByRole('button', { name: 'Pay now' })",
      })),
    };
    const context = {
      newPage: vi.fn(async () => page),
      storageState: storageStateMock,
      close: vi.fn(async () => {}),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };

    firefoxLaunchMock.mockResolvedValue(browser);

    const locator = await pickLocatorInteractively({
      url: "http://127.0.0.1:5173/checkout",
      browser: "firefox",
      device: "Pixel 5",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
    });

    expect(locator).toBe("getByRole('button', { name: 'Pay now' })");
    expect(setTestIdAttributeMock).toHaveBeenCalledWith("data-qa");
    expect(firefoxLaunchMock).toHaveBeenCalledWith({ headless: false });
    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 393, height: 851 },
      userAgent: "pixel-5",
      isMobile: true,
      hasTouch: true,
      defaultBrowserType: "chromium",
      storageState: ".auth/in.json",
    });
    expect(page.goto).toHaveBeenCalledWith("http://127.0.0.1:5173/checkout");
    expect(storageStateMock).toHaveBeenCalledWith({ path: ".auth/out.json" });
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("closes context and browser when picking fails", async () => {
    const context = {
      newPage: vi.fn(async () => ({
        goto: vi.fn(async () => {}),
        pickLocator: vi.fn(async () => {
          throw new Error("pick cancelled");
        }),
      })),
      close: vi.fn(async () => {}),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };

    chromiumLaunchMock.mockResolvedValue(browser);

    await expect(
      pickLocatorInteractively({
        url: "http://127.0.0.1:5173/checkout",
        browser: "chromium",
      })
    ).rejects.toThrow("pick cancelled");

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});

describe("buildContextOptions", () => {
  it("keeps storage-only fallback options when no device is set", () => {
    expect(
      buildContextOptions({
        url: "http://127.0.0.1:5173",
        browser: "chromium",
        loadStorage: ".auth/in.json",
      })
    ).toEqual({
      storageState: ".auth/in.json",
    });
  });
});
