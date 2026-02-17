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
    // CMP-specific selectors
    expect(script).toContain("#onetrust-accept-btn-handler");
    expect(script).toContain("CybotCookiebotDialog");
    expect(script).toContain("#didomi-notice-agree-button");
    expect(script).toContain(".cky-btn-accept");
    expect(script).toContain(".trustarc-agree-btn");
    // Multilingual text patterns
    expect(script).toContain("akkoord");
    expect(script).toContain("accepteren");
    expect(script).toContain("akzeptieren");
    expect(script).toContain("accepter");
    expect(script).toContain("aceptar");
    expect(script).toContain("akceptuj");
    expect(script).toContain("elfogadom");
    // Infrastructure
    expect(script).toContain("MutationObserver");
  });

  it("ACCEPT_PATTERNS regex matches expected text and rejects false positives", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    // Extract the regex source and flags from the script
    const regexMatch = script.match(/var ACCEPT_PATTERNS = \/(.*)\/([a-z]*);/);
    expect(regexMatch).not.toBeNull();
    const pattern = new RegExp(regexMatch![1], regexMatch![2]);

    // Should match exact cookie consent button texts
    const shouldMatch = [
      "Accept", "Accept all", "OK", "Got it", "I agree",
      "Akkoord", "Accepteren", "Alle cookies accepteren",
      "Akzeptieren", "Alle akzeptieren", "Einverstanden",
      "Accepter", "Tout accepter",
      "Aceptar", "Aceptar todo",
      "Accetta", "Accetta tutto",
      "Akceptuj", "Elfogadom",
    ];
    for (const text of shouldMatch) {
      expect(pattern.test(text)).toBe(true);
    }

    // Should NOT match partial/unrelated text ($ anchor prevents these)
    const shouldNotMatch = [
      "Okidoki", "Ok, continue", "Accepting terms",
      "Allowed items", "I agree to the terms",
      "Accept and subscribe to newsletter",
    ];
    for (const text of shouldNotMatch) {
      expect(pattern.test(text)).toBe(false);
    }
  });
});
