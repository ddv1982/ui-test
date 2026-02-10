import { describe, it, expect, vi } from "vitest";
import { resolveLocator, parseGetByArgs, stepDescription } from "./player.js";
import type { Step } from "./yaml-schema.js";
import type { Page } from "playwright";

describe("parseGetByArgs", () => {
  it("should parse single quoted string", () => {
    const args = parseGetByArgs("'button'");
    expect(args).toEqual(["button"]);
  });

  it("should parse double quoted string", () => {
    const args = parseGetByArgs('"Submit"');
    expect(args).toEqual(["Submit"]);
  });

  it("should parse role with options object", () => {
    const args = parseGetByArgs('"button", { "name": "Submit" }');
    expect(args).toEqual(["button", { name: "Submit" }]);
  });

  it("should handle complex options", () => {
    const args = parseGetByArgs('"heading", { "level": 1, "name": "Welcome" }');
    expect(args).toEqual(["heading", { level: 1, name: "Welcome" }]);
  });

  it("should fallback to original string if parsing fails", () => {
    const args = parseGetByArgs("invalid(syntax");
    expect(args).toEqual(["invalid(syntax"]);
  });
});

describe("resolveLocator", () => {
  const createMockPage = () => {
    const mockLocator = { click: vi.fn() };
    return {
      locator: vi.fn().mockReturnValue(mockLocator),
      getByRole: vi.fn().mockReturnValue(mockLocator),
      getByText: vi.fn().mockReturnValue(mockLocator),
      getByLabel: vi.fn().mockReturnValue(mockLocator),
      getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
      getByAltText: vi.fn().mockReturnValue(mockLocator),
      getByTitle: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
    } as unknown as Page;
  };

  it("should handle getByRole selector", () => {
    const page = createMockPage();
    resolveLocator(page, "getByRole('button')");
    expect(page.getByRole).toHaveBeenCalledWith("button");
  });

  it("should handle getByRole with options", () => {
    const page = createMockPage();
    resolveLocator(page, 'getByRole("button", { "name": "Submit" })');
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Submit" });
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
