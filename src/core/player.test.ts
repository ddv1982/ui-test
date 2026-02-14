import { describe, it, expect, vi } from "vitest";
import { errors as playwrightErrors, type Page } from "playwright";
import {
  isPlaywrightLocator,
  resolveLocator,
  resolveLocatorContext,
  resolveNavigateUrl,
  stepDescription,
  waitForPostStepNetworkIdle,
  isPlaywrightTimeoutError,
} from "./player.js";
import type { Step, Target } from "./yaml-schema.js";

function makeTarget(value: string, kind: Target["kind"] = "css"): Target {
  return {
    value,
    kind,
    source: "manual",
  };
}

describe("resolveLocator", () => {
  const createMockPage = () => {
    const mockLocator = {
      click: vi.fn(),
      fill: vi.fn(),
      waitFor: vi.fn(),
      selectOption: vi.fn(),
      filter: vi.fn(),
      first: vi.fn(),
      last: vi.fn(),
      nth: vi.fn(),
      and: vi.fn(),
      or: vi.fn(),
      getByRole: vi.fn(),
      getByText: vi.fn(),
      getByLabel: vi.fn(),
      getByPlaceholder: vi.fn(),
      getByAltText: vi.fn(),
      getByTitle: vi.fn(),
      getByTestId: vi.fn(),
      locator: vi.fn(),
      contentFrame: vi.fn(),
      owner: vi.fn(),
    };

    mockLocator.filter.mockReturnValue(mockLocator);
    mockLocator.first.mockReturnValue(mockLocator);
    mockLocator.last.mockReturnValue(mockLocator);
    mockLocator.nth.mockReturnValue(mockLocator);
    mockLocator.and.mockReturnValue(mockLocator);
    mockLocator.or.mockReturnValue(mockLocator);
    mockLocator.getByRole.mockReturnValue(mockLocator);
    mockLocator.getByText.mockReturnValue(mockLocator);
    mockLocator.getByLabel.mockReturnValue(mockLocator);
    mockLocator.getByPlaceholder.mockReturnValue(mockLocator);
    mockLocator.getByAltText.mockReturnValue(mockLocator);
    mockLocator.getByTitle.mockReturnValue(mockLocator);
    mockLocator.getByTestId.mockReturnValue(mockLocator);
    mockLocator.locator.mockReturnValue(mockLocator);
    mockLocator.owner.mockReturnValue(mockLocator);

    const mockFrameLocator = {
      getByRole: vi.fn().mockReturnValue(mockLocator),
      getByText: vi.fn().mockReturnValue(mockLocator),
      getByLabel: vi.fn().mockReturnValue(mockLocator),
      getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
      getByAltText: vi.fn().mockReturnValue(mockLocator),
      getByTitle: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
      locator: vi.fn().mockReturnValue(mockLocator),
      frameLocator: vi.fn(),
      owner: vi.fn().mockReturnValue(mockLocator),
    };

    mockFrameLocator.frameLocator.mockReturnValue(mockFrameLocator);
    mockLocator.contentFrame.mockReturnValue(mockFrameLocator as unknown as typeof mockLocator);

    return {
      locator: vi.fn().mockReturnValue(mockLocator),
      getByRole: vi.fn().mockReturnValue(mockLocator),
      getByText: vi.fn().mockReturnValue(mockLocator),
      getByLabel: vi.fn().mockReturnValue(mockLocator),
      getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
      getByAltText: vi.fn().mockReturnValue(mockLocator),
      getByTitle: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
      frameLocator: vi.fn().mockReturnValue(mockFrameLocator),
    } as unknown as Page;
  };

  it("resolves locator expressions", () => {
    const page = createMockPage();
    resolveLocator(page, makeTarget("getByRole('button')", "locatorExpression"));
    expect(page.getByRole).toHaveBeenCalledWith("button");
  });

  it("supports contentFrame/owner in expression chains", () => {
    const page = createMockPage();
    resolveLocator(
      page,
      makeTarget("locator('iframe').contentFrame().getByRole('button').owner()", "locatorExpression")
    );
    expect(page.locator).toHaveBeenCalledWith("iframe");
  });

  it("routes non-expression selectors via page.locator", () => {
    const page = createMockPage();
    resolveLocator(page, makeTarget("text=Click here", "playwrightSelector"));
    expect(page.locator).toHaveBeenCalledWith("text=Click here");
  });

  it("applies framePath context", () => {
    const page = createMockPage();
    resolveLocator(page, {
      value: "button.save",
      kind: "css",
      source: "manual",
      framePath: ["#checkout-frame"],
    });
    expect(page.frameLocator).toHaveBeenCalledWith("#checkout-frame");
  });

  it("throws for unsupported chain methods", () => {
    const page = createMockPage();
    expect(() => {
      resolveLocator(page, makeTarget("getByRole('button').unknownMethod('x')", "locatorExpression"));
    }).toThrow(/Unsupported locator chain method/);
  });
});

describe("resolveLocatorContext", () => {
  it("builds chained frameLocator context", () => {
    const rootFrame = {
      frameLocator: vi.fn(),
      locator: vi.fn(),
    };
    rootFrame.frameLocator.mockReturnValue(rootFrame);

    const page = {
      frameLocator: vi.fn().mockReturnValue(rootFrame),
      locator: vi.fn(),
    } as unknown as Page;

    const context = resolveLocatorContext(page, ["#outer", "#inner"]);
    expect(context).toBe(rootFrame);
    expect(page.frameLocator).toHaveBeenCalledWith("#outer");
    expect(rootFrame.frameLocator).toHaveBeenCalledWith("#inner");
  });
});

describe("resolveNavigateUrl", () => {
  it("keeps absolute URLs unchanged", () => {
    expect(resolveNavigateUrl("https://example.com/login", "https://base.example", "about:blank")).toBe(
      "https://example.com/login"
    );
  });

  it("resolves root-relative URL against baseUrl", () => {
    expect(resolveNavigateUrl("/x", "https://a.com/app", "about:blank")).toBe("https://a.com/x");
  });

  it("resolves path-relative URL against baseUrl path", () => {
    expect(resolveNavigateUrl("x", "https://a.com/app/", "about:blank")).toBe("https://a.com/app/x");
  });

  it("resolves root-relative URL against current page if baseUrl is missing", () => {
    expect(resolveNavigateUrl("/next", undefined, "https://a.com/app/start")).toBe("https://a.com/next");
  });

  it("throws when relative URL cannot be resolved", () => {
    expect(() => resolveNavigateUrl("/next", undefined, "about:blank")).toThrow(
      /Cannot resolve relative navigation URL/
    );
  });

  it("throws on malformed base URL", () => {
    expect(() => resolveNavigateUrl("/next", "not-a-url", "about:blank")).toThrow(
      /Invalid navigation URL/
    );
  });
});

describe("stepDescription", () => {
  it("formats navigate step", () => {
    const step: Step = { action: "navigate", url: "https://example.com" };
    expect(stepDescription(step, 0)).toBe("Step 1: navigate to https://example.com");
  });

  it("formats click step with css target", () => {
    const step: Step = { action: "click", target: makeTarget("button") };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'button'");
  });

  it("includes description", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("#submit"),
      description: "Submit form",
    };
    expect(stepDescription(step, 1)).toBe("Step 2: click '#submit' - Submit form");
  });

  it("formats fill step with target and text", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget("getByLabel('Email')", "locatorExpression"),
      text: "user@example.com",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: fill \'Email\' → "user@example.com"');
  });

  it("formats press step with key", () => {
    const step: Step = {
      action: "press",
      target: makeTarget("getByRole('textbox')", "locatorExpression"),
      key: "Enter",
    };
    expect(stepDescription(step, 0)).toBe("Step 1: press 'Enter'");
  });

  it("formats assertVisible step with target", () => {
    const step: Step = {
      action: "assertVisible",
      target: makeTarget("#app"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: assertVisible '#app'");
  });

  it("formats assertText step with target and text", () => {
    const step: Step = {
      action: "assertText",
      target: makeTarget("getByRole('heading')", "locatorExpression"),
      text: "Welcome",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: assertText \'heading\' → "Welcome"');
  });

  it("formats assertValue step with target and value", () => {
    const step: Step = {
      action: "assertValue",
      target: makeTarget("getByLabel('Email')", "locatorExpression"),
      value: "user@example.com",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: assertValue \'Email\' → "user@example.com"');
  });

  it("formats assertChecked step with target", () => {
    const step: Step = {
      action: "assertChecked",
      target: makeTarget("getByRole('checkbox', { name: 'Remember me' })", "locatorExpression"),
      checked: true,
    };
    expect(stepDescription(step, 0)).toBe("Step 1: assertChecked 'Remember me'");
  });

  it("extracts name from locatorExpression with name arg", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("getByRole('button', { name: 'Sign in' })", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'Sign in'");
  });

  it("extracts name arg with embedded apostrophe", () => {
    const step: Step = {
      action: "click",
      target: makeTarget('getByRole("button", { name: "Bob\'s House" })', "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'Bob's House'");
  });

  it("extracts escaped quote in name arg", () => {
    const step: Step = {
      action: "click",
      target: makeTarget('getByRole("button", { name: "Say \\"hi\\"" })', "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'Say \"hi\"'");
  });

  it("truncates long target values", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("div.very-long-selector-name-that-exceeds-limit"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'div.very-long-selector-name...'");
  });

  it("formats select step with target and value", () => {
    const step: Step = {
      action: "select",
      target: makeTarget("getByLabel('Country')", "locatorExpression"),
      value: "US",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: select \'Country\' → "US"');
  });

  it("formats hover step with target", () => {
    const step: Step = { action: "hover", target: makeTarget("#menu-item") };
    expect(stepDescription(step, 0)).toBe("Step 1: hover '#menu-item'");
  });

  it("formats check step with target", () => {
    const step: Step = {
      action: "check",
      target: makeTarget("getByLabel('Terms')", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: check 'Terms'");
  });

  it("formats uncheck step with target", () => {
    const step: Step = {
      action: "uncheck",
      target: makeTarget("getByLabel('Newsletter')", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: uncheck 'Newsletter'");
  });

  it("handles locator expressions with embedded quotes", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("getByText(\"it's here\")", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'it's here'");
  });

  it("truncates long fill text", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget("input"),
      text: "a-very-long-text-value-that-exceeds-the-limit",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: fill \'input\' \u2192 "a-very-long-text-..."');
  });
});

describe("waitForPostStepNetworkIdle", () => {
  it("waits for network idle when enabled", async () => {
    const page = {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true, 2000)).resolves.toBe(false);
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 2000 });
  });

  it("returns timed out marker on network idle timeout", async () => {
    const page = {
      waitForLoadState: vi.fn().mockRejectedValue(new playwrightErrors.TimeoutError("timed out")),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true, 700)).resolves.toBe(true);
  });

  it("throws non-timeout errors", async () => {
    const page = {
      waitForLoadState: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, true, 2000)).rejects.toThrow("boom");
  });

  it("skips waiting when disabled", async () => {
    const page = {
      waitForLoadState: vi.fn(),
    } as unknown as Page;

    await expect(waitForPostStepNetworkIdle(page, false, 2000)).resolves.toBe(false);
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });
});

describe("isPlaywrightTimeoutError", () => {
  it("detects playwright TimeoutError", () => {
    expect(isPlaywrightTimeoutError(new playwrightErrors.TimeoutError("x"))).toBe(true);
  });

  it("detects timeout errors by name fallback", () => {
    const err = new Error("x");
    err.name = "TimeoutError";
    expect(isPlaywrightTimeoutError(err)).toBe(true);
  });

  it("returns false for non-timeout errors", () => {
    expect(isPlaywrightTimeoutError(new Error("x"))).toBe(false);
  });
});

describe("isPlaywrightLocator", () => {
  it("returns true for locator-like objects", () => {
    expect(
      isPlaywrightLocator({
        locator: () => undefined,
        click: () => undefined,
        waitFor: () => Promise.resolve(),
      })
    ).toBe(true);
  });

  it("returns false for non-locators", () => {
    expect(isPlaywrightLocator({})).toBe(false);
  });
});
