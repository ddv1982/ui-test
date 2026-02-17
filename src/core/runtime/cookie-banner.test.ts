import { describe, expect, it, vi } from "vitest";
import { installCookieBannerDismisser } from "./cookie-banner.js";

describe("installCookieBannerDismisser", () => {
  it("calls addInitScript on the context", async () => {
    const context = { addInitScript: vi.fn() };

    await installCookieBannerDismisser(context as any);

    expect(context.addInitScript).toHaveBeenCalledOnce();
    expect(typeof context.addInitScript.mock.calls[0][0]).toBe("string");
  });

  it("injects a script that contains cookie banner selectors", async () => {
    const context = { addInitScript: vi.fn() };

    await installCookieBannerDismisser(context as any);

    const script = context.addInitScript.mock.calls[0][0] as string;
    expect(script).toContain("#onetrust-accept-btn-handler");
    expect(script).toContain("CybotCookiebotDialog");
    expect(script).toContain("MutationObserver");
  });
});
