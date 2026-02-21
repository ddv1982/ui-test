import { afterEach, describe, expect, it } from "vitest";
import type { Locator, Page } from "playwright";
import { generateRuntimeRepairCandidates } from "./selector-runtime-repair.js";

function pageStub(): Page {
  return {} as Page;
}

function locatorStub(input: {
  count: number;
  resolveSelector?: () => Promise<{ resolvedSelector: string }>;
}): Locator {
  return {
    count: async () => input.count,
    _resolveSelector: input.resolveSelector,
  } as unknown as Locator;
}

describe("generateRuntimeRepairCandidates", () => {
  afterEach(() => {
    delete process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_PRIVATE_FALLBACK"];
  });

  it("generates runtime repair via public conversion for dynamic internal selectors", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update Schiphol 12:30"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 2,
        dynamicSignals: ["contains_weather_or_news_fragment"],
      },
      {
        resolveLocatorFn: () => locatorStub({ count: 1 }),
        toLocatorExpressionFromSelectorFn: (_page, selector) => {
          if (selector.includes("internal:role")) {
            return "getByRole('link', { name: /winterweer\\s+update/i })";
          }
          return undefined;
        },
      }
    );

    expect(result.runtimeUnique).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.reasonCodes).toContain("locator_repair_playwright_runtime");
    expect(result.candidates[0]?.dynamicSignals).toEqual([
      "contains_weather_or_news_fragment",
    ]);
    expect(result.sourceMarkers).toEqual([
      {
        candidateId: "repair-playwright-runtime-1",
        source: "public_conversion",
      },
    ]);
  });

  it("skips when runtime match is non-unique", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 1,
        dynamicSignals: ["contains_weather_or_news_fragment"],
      },
      {
        resolveLocatorFn: () => locatorStub({ count: 3 }),
      }
    );

    expect(result.candidates).toEqual([]);
    expect(result.runtimeUnique).toBe(false);
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "selector_repair_playwright_runtime_non_unique"
      )
    ).toBe(true);
  });

  it("falls back to private resolved selector path when public conversion is unavailable", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: "getByRole('link', { name: 'Winterweer update', exact: true })",
          kind: "locatorExpression",
          source: "manual",
          framePath: ["iframe[name='news']"],
        },
        stepNumber: 5,
        dynamicSignals: ["exact_true", "contains_weather_or_news_fragment"],
      },
      {
        resolveLocatorFn: () =>
          locatorStub({
            count: 1,
            resolveSelector: async () => ({ resolvedSelector: "css=a.news-link" }),
          }),
        toLocatorExpressionFromSelectorFn: (_page, selector) => {
          if (selector === "css=a.news-link") {
            return "getByRole('link', { name: /winterweer/i })";
          }
          return undefined;
        },
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.sourceMarkers).toEqual([
      {
        candidateId: "repair-playwright-runtime-1",
        source: "resolved_selector_fallback",
      },
    ]);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "selector_repair_playwright_runtime_private_fallback_used"
      )
    ).toBe(true);
    expect(result.candidates[0]?.target.framePath).toEqual(["iframe[name='news']"]);
  });

  it("skips private fallback when it is explicitly disabled", async () => {
    process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_PRIVATE_FALLBACK"] = "1";

    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: "getByRole('link', { name: 'Winterweer update', exact: true })",
          kind: "locatorExpression",
          source: "manual",
        },
        stepNumber: 5,
      },
      {
        resolveLocatorFn: () =>
          locatorStub({
            count: 1,
            resolveSelector: async () => ({ resolvedSelector: "css=a.news-link" }),
          }),
        toLocatorExpressionFromSelectorFn: () => undefined,
      }
    );

    expect(result.candidates).toEqual([]);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code ===
          "selector_repair_playwright_runtime_private_fallback_disabled"
      )
    ).toBe(true);
  });

  it("reports unavailable when runtime resolver cannot be created", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: "css=.headline",
          kind: "css",
          source: "manual",
        },
        stepNumber: 3,
      },
      {
        resolveLocatorFn: () => {
          throw new Error("no runtime");
        },
      }
    );

    expect(result.candidates).toHaveLength(0);
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "selector_repair_playwright_runtime_unavailable"
      )
    ).toBe(true);
  });

  it("reports conversion_failed when private resolved selector cannot be converted", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: "getByRole('link', { name: 'Winterweer update', exact: true })",
          kind: "locatorExpression",
          source: "manual",
        },
        stepNumber: 7,
      },
      {
        resolveLocatorFn: () =>
          locatorStub({
            count: 1,
            resolveSelector: async () => ({ resolvedSelector: "css=a.news-link" }),
          }),
        toLocatorExpressionFromSelectorFn: () => undefined,
      }
    );

    expect(result.candidates).toHaveLength(0);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "selector_repair_playwright_runtime_conversion_failed"
      )
    ).toBe(true);
  });

  it("does not retain framePath when locator expression is already frame-aware", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
          framePath: ["iframe[name='news']"],
        },
        stepNumber: 8,
      },
      {
        resolveLocatorFn: () => locatorStub({ count: 1 }),
        toLocatorExpressionFromSelectorFn: () =>
          "frameLocator('iframe[name=\"news\"]').getByRole('link', { name: /winterweer/i })",
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.target.framePath).toBeUndefined();
  });
});
