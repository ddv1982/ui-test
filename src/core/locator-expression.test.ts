import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import {
  evaluateLocatorExpression,
  looksLikeLocatorExpression,
} from "./locator-expression.js";

function createMockPage(): Page {
  const mockLocator = {
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
    frameLocator: vi.fn(),
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
}

describe("looksLikeLocatorExpression", () => {
  it("should detect locator expressions", () => {
    expect(looksLikeLocatorExpression("getByRole('button')")).toBe(true);
    expect(looksLikeLocatorExpression("frameLocator('#frame').getByText('Save')")).toBe(true);
  });

  it("should ignore non-locator selectors", () => {
    expect(looksLikeLocatorExpression("#submit")).toBe(false);
    expect(looksLikeLocatorExpression("text=Save")).toBe(false);
  });
});

describe("evaluateLocatorExpression", () => {
  it("should evaluate getByRole with object options", () => {
    const page = createMockPage();
    evaluateLocatorExpression(page, "getByRole('button', { name: 'Submit' })");
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Submit" });
  });

  it("should evaluate chained expression with regex and nth", () => {
    const page = createMockPage();
    evaluateLocatorExpression(
      page,
      "getByRole('button', { name: /submit/i }).filter({ hasText: 'Submit' }).nth(0)"
    );
    expect(page.getByRole).toHaveBeenCalledWith(
      "button",
      expect.objectContaining({ name: expect.any(RegExp) })
    );
  });

  it("should evaluate frameLocator chain", () => {
    const page = createMockPage();
    evaluateLocatorExpression(page, "frameLocator('#f').getByText('Save').first()");
    expect(page.frameLocator).toHaveBeenCalledWith("#f");
  });

  it("should reject unknown root expression", () => {
    const page = createMockPage();
    expect(() => evaluateLocatorExpression(page, "exit(1)")).toThrow(
      /Unsupported root locator method/
    );
  });

  it("should reject arbitrary process expression", () => {
    const page = createMockPage();
    expect(() => evaluateLocatorExpression(page, "process.exit(1)")).toThrow(
      /Unsupported locator chain method/
    );
  });

  it("should reject unknown member chains", () => {
    const page = createMockPage();
    expect(() => evaluateLocatorExpression(page, "foo.bar()")).toThrow(
      /Unsupported locator chain method/
    );
  });

  it("should reject computed member access", () => {
    const page = createMockPage();
    expect(() => evaluateLocatorExpression(page, "getByRole('button')['click']()")).toThrow(
      /Computed property access is not allowed/
    );
  });

  it("should reject function expressions", () => {
    const page = createMockPage();
    expect(() => evaluateLocatorExpression(page, "getByText((() => 'x')())")).toThrow(
      /Unsupported call syntax/
    );
  });
});
