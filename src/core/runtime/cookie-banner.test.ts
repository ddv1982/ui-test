import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  dismissCookieBannerIfPresent,
  installCookieBannerDismisser,
  isLikelyOverlayInterceptionError,
} from "./cookie-banner.js";

interface FakeControl {
  click: ReturnType<typeof vi.fn>;
  disabled?: boolean;
  textContent: string;
  getAttribute: (name: string) => string | null;
  getClientRects: () => Array<{ width: number; height: number }>;
  _style: {
    display: string;
    visibility: string;
    pointerEvents: string;
    opacity: string;
  };
}

interface LocatorEntry {
  visible?: boolean;
  click?: () => Promise<void> | void;
  textContent?: string;
  value?: string;
}

function makeControl(
  text: string,
  options?: { disabled?: boolean; hidden?: boolean; attrs?: Record<string, string> }
): FakeControl {
  const attrs = options?.attrs ?? {};
  const hidden = options?.hidden === true;
  return {
    click: vi.fn(),
    disabled: options?.disabled,
    textContent: text,
    getAttribute: (name: string) => attrs[name] ?? null,
    getClientRects: () => (hidden ? [] : [{ width: 100, height: 20 }]),
    _style: hidden
      ? { display: "none", visibility: "hidden", pointerEvents: "none", opacity: "0" }
      : { display: "block", visibility: "visible", pointerEvents: "auto", opacity: "1" },
  };
}

function executeInjectedDismissScript(input: {
  script: string;
  host?: string;
  path?: string;
  title?: string;
  bodyText?: string;
  consentMarker?: boolean;
  markerToken?: string;
  globalControls?: FakeControl[];
  containerControls?: FakeControl[];
  containerHints?: Record<string, string>;
}) {
  const container = {
    id: input.containerHints?.id ?? "",
    className: input.containerHints?.className ?? "",
    textContent: input.containerHints?.textContent ?? "",
    getAttribute: (name: string) => input.containerHints?.[name] ?? null,
    querySelectorAll: (selector: string) =>
      selector === "button, [role=\"button\"], a"
        ? (input.containerControls ?? [])
        : [],
  };

  const documentObj = {
    readyState: "complete",
    title: input.title ?? "",
    body: { innerText: input.bodyText ?? "" },
    documentElement: {},
    addEventListener: vi.fn(),
    querySelector: (selector: string) => {
      if (input.consentMarker === true && selector.includes("[id*=\"consent\"]")) {
        return { id: "consent-root" };
      }
      if (input.markerToken && selector.includes(input.markerToken)) {
        return { id: "consent-root" };
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === "*") return [];
      if (selector.includes("[class*=\"cookie\"]")) {
        return input.containerControls ? [container] : [];
      }
      if (selector.includes("input[type=\"submit\"]")) {
        return input.globalControls ?? [];
      }
      return [];
    },
  };

  const windowObj = {
    location: {
      hostname: input.host ?? "example.com",
      pathname: input.path ?? "/",
    },
    getComputedStyle: (control: FakeControl) => control._style,
  };

  class FakeMutationObserver {
    observe() {}

    disconnect() {}
  }

  const sandbox = {
    window: windowObj,
    document: documentObj,
    MutationObserver: FakeMutationObserver,
    setTimeout: (cb: () => void) => {
      cb();
      return 0;
    },
  };

  vm.runInNewContext(input.script, sandbox);
}

function makeLocator(entries: LocatorEntry[]) {
  const read = (index: number): LocatorEntry | undefined =>
    index >= 0 && index < entries.length ? entries[index] : undefined;

  const makeNth = (index: number) => ({
    first: () => makeNth(index),
    isVisible: async () => Boolean(read(index)?.visible),
    click: async () => {
      await read(index)?.click?.();
    },
    getAttribute: async (name: string) => {
      if (name === "value") return read(index)?.value ?? null;
      return null;
    },
    textContent: async () => read(index)?.textContent ?? "",
  });

  return {
    first: () => makeNth(0),
    nth: (index: number) => makeNth(index),
    count: async () => entries.length,
    isVisible: async () => Boolean(read(0)?.visible),
    click: async () => {
      await read(0)?.click?.();
    },
    getAttribute: async (name: string) => {
      if (name === "value") return read(0)?.value ?? null;
      return null;
    },
    textContent: async () => read(0)?.textContent ?? "",
  };
}

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
    expect(script).toContain("collectRoots");
    expect(script).toContain("clickMatchingControl");
    expect(script).toContain("input[type=\"submit\"]");
    expect(script).not.toContain("[role=\"dialog\"]");
    expect(script).not.toContain("[role=\"alertdialog\"]");
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

  it("does not click generic controls without consent context", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/dashboard",
      title: "Example Dashboard",
      bodyText: "Welcome to the app",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls when page text only mentions partners", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/partners",
      title: "Partner Portal",
      bodyText: "Our partner program is now open",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls on privacy routes without consent markers", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/privacy",
      title: "Privacy Settings",
      bodyText: "Application privacy preferences",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls on non-CMP consent subdomains", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "consent.example.com",
      path: "/app",
      title: "Application Settings",
      bodyText: "General account controls",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls when only privacy markers exist", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/account",
      title: "Account Settings",
      markerToken: "privacy",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls when page text only mentions advertising", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/campaigns",
      title: "Campaign Manager",
      bodyText: "Advertising campaign settings",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("does not click generic controls when page text only mentions tracking", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const okControl = makeControl("OK");

    executeInjectedDismissScript({
      script,
      host: "example.com",
      path: "/analytics",
      title: "Analytics Dashboard",
      bodyText: "Tracking preferences for project metrics",
      globalControls: [okControl],
    });

    expect(okControl.click).not.toHaveBeenCalled();
  });

  it("clicks consent control in privacy-host context via global fallback", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const akkoordControl = makeControl("Akkoord");

    executeInjectedDismissScript({
      script,
      host: "myprivacy.dpgmedia.nl",
      path: "/consent",
      title: "DPG Media Privacy Gate",
      globalControls: [akkoordControl],
    });

    expect(akkoordControl.click).toHaveBeenCalledTimes(1);
  });

  it("skips hidden and disabled matching controls", async () => {
    const context = { addInitScript: vi.fn() };
    await installCookieBannerDismisser(context as any);
    const script = context.addInitScript.mock.calls[0][0] as string;

    const disabledAccept = makeControl("Accept", { disabled: true });
    const hiddenAccept = makeControl("Akkoord", { hidden: true });

    executeInjectedDismissScript({
      script,
      host: "myprivacy.dpgmedia.nl",
      path: "/consent",
      globalControls: [disabledAccept, hiddenAccept],
    });

    expect(disabledAccept.click).not.toHaveBeenCalled();
    expect(hiddenAccept.click).not.toHaveBeenCalled();
  });
});

describe("dismissCookieBannerIfPresent", () => {
  it("clicks known CMP selectors when present", async () => {
    const cmpClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://www.nu.nl/",
      locator: (selector: string) => {
        if (selector === "#onetrust-accept-btn-handler") {
          return makeLocator([{ visible: true, click: cmpClick }]);
        }
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "" }]);
        }
        return makeLocator([]);
      },
      getByRole: () => makeLocator([]),
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(true);
    expect(cmpClick).toHaveBeenCalledTimes(1);
  });

  it("does not click generic accept controls without consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/dashboard",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Welcome dashboard" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat generic dialogs as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/settings",
      locator: (selector: string) => {
        if (selector.includes("[role=\"dialog\"]")) {
          return makeLocator([{ visible: true }]);
        }
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "General settings dialog" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat partner-page content as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/partners",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Our partner program is now open" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat privacy URL alone as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/privacy",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Application privacy settings" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat non-CMP consent subdomains as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://consent.example.com/app",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "General app settings" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat privacy markers alone as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/account",
      locator: (selector: string) => {
        if (selector.includes("[class*=\"privacy\"]")) {
          return makeLocator([{ visible: true }]);
        }
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Account settings" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat advertising-page content as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/campaigns",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Advertising campaign settings" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("does not treat tracking-page content as consent context", async () => {
    const genericClick = vi.fn(async () => {});
    const frame = {
      url: () => "https://example.com/analytics",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([{ visible: true, textContent: "Tracking preferences for project metrics" }]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: genericClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [frame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(false);
    expect(genericClick).not.toHaveBeenCalled();
  });

  it("clicks consent controls in consent-context frames (iframe flow)", async () => {
    const consentClick = vi.fn(async () => {});
    const mainFrame = {
      url: () => "https://www.nu.nl/",
      locator: (selector: string) => {
        if (selector === "body") return makeLocator([{ visible: true, textContent: "" }]);
        return makeLocator([]);
      },
      getByRole: () => makeLocator([]),
    };
    const consentFrame = {
      url: () => "https://myprivacy.dpgmedia.nl/consent",
      locator: (selector: string) => {
        if (selector === "body") {
          return makeLocator([
            { visible: true, textContent: "Jouw privacy-instellingen Akkoord Instellen" },
          ]);
        }
        return makeLocator([]);
      },
      getByRole: (role: string) => {
        if (role === "button") {
          return makeLocator([{ visible: true, click: consentClick }]);
        }
        return makeLocator([]);
      },
    };
    const page = { frames: () => [mainFrame, consentFrame] };

    const dismissed = await dismissCookieBannerIfPresent(page as any);

    expect(dismissed).toBe(true);
    expect(consentClick).toHaveBeenCalledTimes(1);
  });
});

describe("isLikelyOverlayInterceptionError", () => {
  it("detects common pointer interception messages", () => {
    expect(
      isLikelyOverlayInterceptionError(
        new Error("subtree intercepts pointer events while attempting click")
      )
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isLikelyOverlayInterceptionError(new Error("navigation timeout exceeded"))).toBe(false);
  });
});
