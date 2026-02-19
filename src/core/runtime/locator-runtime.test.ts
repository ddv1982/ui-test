import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveLocator } from "./locator-runtime.js";

function createMockLocator(label?: string) {
  const mockLocator: Record<string, unknown> = {
    click: vi.fn(),
    waitFor: vi.fn(),
    locator: vi.fn(),
    or: vi.fn(),
    _label: label ?? "primary",
  };
  // .or() returns a new mock locator representing the chained result
  mockLocator.or = vi.fn((other: unknown) => {
    const chained = createMockLocator(`chained(${(mockLocator as { _label: string })._label},${(other as { _label: string })?._label ?? "?"})`);
    return chained;
  });
  return mockLocator;
}

function createMockPage() {
  const primary = createMockLocator("primary");
  const fallback1 = createMockLocator("fallback1");
  const fallback2 = createMockLocator("fallback2");

  const page = {
    locator: vi.fn((selector: string) => {
      if (selector === "#primary") return primary;
      if (selector === "#fallback1") return fallback1;
      if (selector === "#fallback2") return fallback2;
      return createMockLocator(selector);
    }),
    getByRole: vi.fn().mockReturnValue(primary),
    getByText: vi.fn().mockReturnValue(primary),
    getByLabel: vi.fn().mockReturnValue(primary),
    getByPlaceholder: vi.fn().mockReturnValue(primary),
    getByAltText: vi.fn().mockReturnValue(primary),
    getByTitle: vi.fn().mockReturnValue(primary),
    getByTestId: vi.fn().mockReturnValue(primary),
    frameLocator: vi.fn(),
  } as unknown as Page;

  return { page, primary, fallback1, fallback2 };
}

describe("resolveLocator", () => {
  it("returns primary locator when no fallbacks exist", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
    };

    const result = resolveLocator(page, target);
    expect(result).toBe(primary);
  });

  it("returns primary locator when fallbacks array is empty", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [],
    };

    const result = resolveLocator(page, target);
    expect(result).toBe(primary);
  });

  it("chains a single fallback with .or()", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
      ],
    };

    const result = resolveLocator(page, target);
    expect(primary.or).toHaveBeenCalledOnce();
    expect(result).not.toBe(primary); // should be the chained result
  });

  it("chains two fallbacks with sequential .or() calls", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    resolveLocator(page, target);
    // primary.or() called once with fallback1, then the chained result.or() called with fallback2
    expect(primary.or).toHaveBeenCalledOnce();
  });

  it("skips invalid fallback locator expressions gracefully", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "this is not valid js(((", kind: "locatorExpression", source: "manual" },
      ],
    };

    // Should not throw — invalid fallback is silently skipped
    const result = resolveLocator(page, target);
    expect(result).toBe(primary);
    expect(primary.or).not.toHaveBeenCalled();
  });

  it("chains valid fallback even if another fallback is invalid", () => {
    const { page, primary } = createMockPage();
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "invalid expression(((", kind: "locatorExpression", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = resolveLocator(page, target);
    // First fallback fails silently, second succeeds
    expect(primary.or).toHaveBeenCalledOnce();
    expect(result).not.toBe(primary);
  });
});
