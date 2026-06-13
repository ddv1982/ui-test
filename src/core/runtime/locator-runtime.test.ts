import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveActionLocator, resolveLocator } from "./locator-runtime.js";

function createMockLocator(label?: string, count = 1) {
  const mockLocator: Record<string, unknown> = {
    click: vi.fn(),
    waitFor: vi.fn(),
    locator: vi.fn(),
    or: vi.fn(),
    count: vi.fn(async () => count),
    _label: label ?? "primary",
  };
  // .or() returns a new mock locator representing the chained result
  mockLocator.or = vi.fn((other: unknown) => {
    const chained = createMockLocator(`chained(${(mockLocator as { _label: string })._label},${(other as { _label: string })?._label ?? "?"})`);
    return chained;
  });
  return mockLocator;
}

function createMockPage(counts: Partial<Record<"primary" | "fallback1" | "fallback2", number>> = {}) {
  const primary = createMockLocator("primary", counts.primary ?? 1);
  const fallback1 = createMockLocator("fallback1", counts.fallback1 ?? 1);
  const fallback2 = createMockLocator("fallback2", counts.fallback2 ?? 1);

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

  it("resolveLocator ignores fallbacks and returns the primary locator", () => {
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
    expect(primary.or).not.toHaveBeenCalled();
    expect(result).toBe(primary);
  });

  it("resolveActionLocator returns primary when it has matches", async () => {
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

    const result = await resolveActionLocator(page, target);
    expect(result).toBe(primary);
    expect(primary.or).not.toHaveBeenCalled();
  });

  it("resolveActionLocator uses the first matching fallback when primary has no matches", async () => {
    const { page, fallback2 } = createMockPage({ primary: 0, fallback1: 0, fallback2: 1 });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = await resolveActionLocator(page, target);
    expect(result).toBe(fallback2);
  });

  it("resolveActionLocator falls back to primary when no fallback matches", async () => {
    const { page, primary } = createMockPage({ primary: 0, fallback1: 0, fallback2: 0 });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = await resolveActionLocator(page, target);
    expect(result).toBe(primary);
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

  it("resolveActionLocator skips invalid fallback expressions", async () => {
    const { page, fallback2 } = createMockPage({ primary: 0, fallback2: 1 });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "invalid expression(((", kind: "locatorExpression", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = await resolveActionLocator(page, target);
    expect(result).toBe(fallback2);
  });

  it("resolves locator expressions", () => {
    const { page } = createMockPage();

    resolveLocator(page, {
      value: "getByRole('button')",
      kind: "locatorExpression",
      source: "manual",
    });

    expect(page.getByRole).toHaveBeenCalledWith("button");
  });

  it("routes non-expression selectors via page.locator", () => {
    const { page } = createMockPage();

    resolveLocator(page, {
      value: "text=Click here",
      kind: "playwrightSelector",
      source: "manual",
    });

    expect(page.locator).toHaveBeenCalledWith("text=Click here");
  });

  it("throws for unsupported chain methods", () => {
    const { page } = createMockPage();

    expect(() => {
      resolveLocator(page, {
        value: "getByRole('button').unknownMethod('x')",
        kind: "locatorExpression",
        source: "manual",
      });
    }).toThrow(/Unsupported locator chain method/);
  });
});
