import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Target } from "../yaml-schema.js";
import { resolveActionLocator, resolveLocator } from "./locator-runtime.js";

function timeoutError(): Error {
  const err = new Error("timed out");
  err.name = "TimeoutError";
  return err;
}

function createMockLocator(label?: string, ready = true) {
  const mockLocator: Record<string, unknown> = {
    click: vi.fn(),
    waitFor: vi.fn(async () => {
      if (!ready) throw timeoutError();
    }),
    locator: vi.fn(),
    or: vi.fn(),
    _label: label ?? "primary",
  };
  // .or() returns a new mock locator representing the chained result
  mockLocator.or = vi.fn((other: unknown) => {
    const chained = createMockLocator(
      `chained(${(mockLocator as { _label: string })._label},${(other as { _label: string })?._label ?? "?"})`
    );
    return chained;
  });
  return mockLocator;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createMockPage(
  readiness: Partial<Record<"primary" | "fallback1" | "fallback2", boolean>> = {}
) {
  const primary = createMockLocator("primary", readiness.primary ?? true);
  const fallback1 = createMockLocator("fallback1", readiness.fallback1 ?? true);
  const fallback2 = createMockLocator("fallback2", readiness.fallback2 ?? true);

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

  it("resolveActionLocator returns primary when it is ready", async () => {
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

    const result = await resolveActionLocator(page, target, { timeout: 250 });
    expect(result).toBe(primary);
    expect(primary.or).not.toHaveBeenCalled();
    expect(primary.waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 250 });
  });

  it("resolveActionLocator uses the first ready fallback when primary is not ready", async () => {
    const { page, fallback2 } = createMockPage({
      primary: false,
      fallback1: false,
      fallback2: true,
    });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = await resolveActionLocator(page, target, { timeout: 250 });
    expect(result).toBe(fallback2);
  });

  it("resolveActionLocator waits for a delayed primary instead of using count-based fallback", async () => {
    const { page, primary, fallback1 } = createMockPage();
    const primaryReady = deferred<void>();
    (primary.waitFor as { mockReturnValue(value: Promise<void>): void }).mockReturnValue(
      primaryReady.promise
    );
    (fallback1.waitFor as { mockRejectedValue(value: Error): void }).mockRejectedValue(
      timeoutError()
    );
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
      ],
    };

    const resultPromise = resolveActionLocator(page, target, { timeout: 250 });
    primaryReady.resolve();

    await expect(resultPromise).resolves.toBe(primary);
  });

  it("resolveActionLocator rejects when no locator becomes ready", async () => {
    const { page } = createMockPage({
      primary: false,
      fallback1: false,
      fallback2: false,
    });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "#fallback1", kind: "css", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    await expect(resolveActionLocator(page, target, { timeout: 250 })).rejects.toThrow(
      "timed out"
    );
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
    const { page, fallback2 } = createMockPage({ primary: false, fallback2: true });
    const target: Target = {
      value: "#primary",
      kind: "css",
      source: "manual",
      fallbacks: [
        { value: "invalid expression(((", kind: "locatorExpression", source: "manual" },
        { value: "#fallback2", kind: "css", source: "manual" },
      ],
    };

    const result = await resolveActionLocator(page, target, { timeout: 250 });
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
