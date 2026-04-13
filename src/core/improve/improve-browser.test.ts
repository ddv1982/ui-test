import { beforeEach, describe, expect, it, vi } from "vitest";

const { chromiumLaunchMock, installCookieBannerDismisserMock } = vi.hoisted(() => ({
  chromiumLaunchMock: vi.fn(),
  installCookieBannerDismisserMock: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}));

vi.mock("../runtime/cookie-banner.js", () => ({
  installCookieBannerDismisser: installCookieBannerDismisserMock,
}));

import { launchImproveBrowser } from "./improve-browser.js";

describe("launchImproveBrowser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("applies load storage state after creating the context", async () => {
    const setStorageState = vi.fn(async () => {});
    const page = {};
    const context = {
      setStorageState,
      newPage: vi.fn(async () => page),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };
    chromiumLaunchMock.mockResolvedValue(browser);

    const result = await launchImproveBrowser({ loadStorage: ".auth/state.json" });

    expect(chromiumLaunchMock).toHaveBeenCalledWith({ headless: true });
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(setStorageState).toHaveBeenCalledWith(".auth/state.json");
    expect(installCookieBannerDismisserMock).toHaveBeenCalledWith(context);
    expect(result).toEqual({ browser, page });
  });
});
