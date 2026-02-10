import { describe, it, expect, vi } from "vitest";
import { resolveLocator, resolveNavigateUrl, stepDescription } from "./player.js";
import type { Step } from "./yaml-schema.js";
import type { Page } from "playwright";

describe("resolveLocator", () => {
  const createMockPage = () => {
    const mockLocator = {
      click: vi.fn(),
      fill: vi.fn(),
      filter: vi.fn(),
      first: vi.fn(),
      last: vi.fn(),
      nth: vi.fn(),
      and: vi.fn(),
      or: vi.fn(),
      getByRole: vi.fn(),
      getByText: vi.fn(),
      locator: vi.fn(),
    };

    mockLocator.filter.mockReturnValue(mockLocator);
    mockLocator.first.mockReturnValue(mockLocator);
    mockLocator.last.mockReturnValue(mockLocator);
    mockLocator.nth.mockReturnValue(mockLocator);
    mockLocator.and.mockReturnValue(mockLocator);
    mockLocator.or.mockReturnValue(mockLocator);
    mockLocator.getByRole.mockReturnValue(mockLocator);
    mockLocator.getByText.mockReturnValue(mockLocator);
    mockLocator.locator.mockReturnValue(mockLocator);

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
    };

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

  it("should handle getByRole selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByRole('button')");
    expect(page.getByRole).toHaveBeenCalledWith("button");
  });

  it("should handle getByRole with options", () => {
    const page = createMockPage();
    resolveLocator(page, "getByRole('button', { name: 'Submit' })");
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Submit" });
  });

  it("should handle getByRole with regex options", () => {
    const page = createMockPage();
    resolveLocator(page, "getByRole('button', { name: /submit/i })");
    expect(page.getByRole).toHaveBeenCalledWith(
      "button",
      expect.objectContaining({ name: expect.any(RegExp) })
    );
  });

  it("should handle chained locator expression", () => {
    const page = createMockPage();
    const locator = resolveLocator(
      page,
      "getByRole('button', { name: 'Submit' }).filter({ hasText: 'Submit' }).nth(0)"
    );
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Submit" });
    expect(locator).toBeDefined();
  });

  it("should handle frame locator expression chain", () => {
    const page = createMockPage();
    resolveLocator(page, "frameLocator('#frame').getByText('Save').first()");
    expect(page.frameLocator).toHaveBeenCalledWith("#frame");
  });

  it("should handle getByText selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByText('Welcome')");
    expect(page.getByText).toHaveBeenCalledWith("Welcome");
  });

  it("should handle getByLabel selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByLabel('Username')");
    expect(page.getByLabel).toHaveBeenCalledWith("Username");
  });

  it("should handle getByPlaceholder selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByPlaceholder('Enter email')");
    expect(page.getByPlaceholder).toHaveBeenCalledWith("Enter email");
  });

  it("should handle getByTestId selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByTestId('submit-button')");
    expect(page.getByTestId).toHaveBeenCalledWith("submit-button");
  });

  it("should handle text= selector", () => {
    const page = createMockPage();
    resolveLocator(page, "text=Click here");
    expect(page.getByText).toHaveBeenCalledWith("Click here");
  });

  it("should fallback to locator for CSS selector", () => {
    const page = createMockPage();
    resolveLocator(page, "#submit-btn");
    expect(page.locator).toHaveBeenCalledWith("#submit-btn");
  });

  it("should fallback to locator for XPath selector", () => {
    const page = createMockPage();
    resolveLocator(page, "//button[@id='submit']");
    expect(page.locator).toHaveBeenCalledWith("//button[@id='submit']");
  });

  it("should throw for unsupported chain methods", () => {
    const page = createMockPage();
    expect(() =>
      resolveLocator(page, "getByRole('button').unknownMethod('x')")
    ).toThrow(/Unsupported locator chain method/);
  });
});

describe("resolveNavigateUrl", () => {
  it("should keep absolute URLs unchanged", () => {
    expect(
      resolveNavigateUrl("https://example.com/login", "https://base.example", "about:blank")
    ).toBe("https://example.com/login");
  });

  it("should resolve root-relative URL against baseUrl", () => {
    expect(resolveNavigateUrl("/x", "https://a.com/app", "about:blank")).toBe(
      "https://a.com/x"
    );
  });

  it("should resolve path-relative URL against baseUrl path", () => {
    expect(resolveNavigateUrl("x", "https://a.com/app/", "about:blank")).toBe(
      "https://a.com/app/x"
    );
  });

  it("should resolve root-relative URL against current page if baseUrl is missing", () => {
    expect(resolveNavigateUrl("/next", undefined, "https://a.com/app/start")).toBe(
      "https://a.com/next"
    );
  });

  it("should throw when relative URL cannot be resolved", () => {
    expect(() => resolveNavigateUrl("/next", undefined, "about:blank")).toThrow(
      /Cannot resolve relative navigation URL/
    );
  });

  it("should throw on malformed base URL", () => {
    expect(() => resolveNavigateUrl("/next", "not-a-url", "about:blank")).toThrow(
      /Invalid navigation URL/
    );
  });
});

describe("stepDescription", () => {
  it("should format navigate step", () => {
    const step: Step = { action: "navigate", url: "https://example.com" };
    const desc = stepDescription(step, 0);
    expect(desc).toBe("Step 1: navigate to https://example.com");
  });

  it("should format navigate step with description", () => {
    const step: Step = {
      action: "navigate",
      url: "/login",
      description: "Go to login page",
    };
    const desc = stepDescription(step, 0);
    expect(desc).toBe("Step 1: navigate to /login - Go to login page");
  });

  it("should format click step", () => {
    const step: Step = { action: "click", selector: "button" };
    const desc = stepDescription(step, 0);
    expect(desc).toBe("Step 1: click");
  });

  it("should format click step with description", () => {
    const step: Step = {
      action: "click",
      selector: "#submit",
      description: "Submit form",
    };
    const desc = stepDescription(step, 1);
    expect(desc).toBe("Step 2: click - Submit form");
  });

  it("should format fill step", () => {
    const step: Step = { action: "fill", selector: "#email", text: "test@example.com" };
    const desc = stepDescription(step, 2);
    expect(desc).toBe("Step 3: fill");
  });

  it("should use 1-based indexing", () => {
    const step: Step = { action: "navigate", url: "/" };
    expect(stepDescription(step, 0)).toContain("Step 1");
    expect(stepDescription(step, 5)).toContain("Step 6");
    expect(stepDescription(step, 99)).toContain("Step 100");
  });
});
