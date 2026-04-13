import { describe, expect, it } from "vitest";
import type { Locator, Page } from "playwright";
import { generateRuntimeRepairCandidates } from "./selector-runtime-repair.js";

function pageStub(): Page {
  return {} as Page;
}

function locatorStub(input: { count: number }): Locator {
  return {
    count: async () => input.count,
  } as unknown as Locator;
}

function normalizedLocatorStub(input: { count: number; normalized: string }): Locator {
  return {
    count: async () => input.count,
    normalize: async () => ({
      toString: () => input.normalized,
    }),
  } as unknown as Locator;
}

describe("generateRuntimeRepairCandidates", () => {
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
      }
    );

    expect(result.runtimeUnique).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.target.value).toBe(
      "getByRole('link', { name: 'Winterweer update Schiphol 12:30' })"
    );
    expect(result.candidates[0]?.reasonCodes).toContain("locator_repair_playwright_runtime");
    expect(result.sourceMarkers).toEqual([
      {
        candidateId: "repair-playwright-runtime-1",
        source: "public_conversion",
      },
    ]);
  });

  it("prefers normalize() output when it resolves to a supported locator expression", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 11,
      },
      {
        resolveLocatorFn: (_page, target) => {
          const resolvedTarget = "action" in target ? target.target : target;
          if (resolvedTarget.kind === "locatorExpression") {
            expect(resolvedTarget.value).toBe(
              "getByRole('link', { name: 'Winterweer update', exact: true })"
            );
          }
          return normalizedLocatorStub({
            count: 1,
            normalized: "getByRole('link', { name: 'Winterweer update', exact: true })",
          });
        },
      }
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.target.value).toBe(
      "getByRole('link', { name: 'Winterweer update', exact: true })"
    );
    expect(result.candidates[1]?.target.value).toBe(
      "getByRole('link', { name: 'Winterweer update' })"
    );
    expect(result.sourceMarkers).toEqual([
      { candidateId: "repair-playwright-runtime-1", source: "normalize" },
      { candidateId: "repair-playwright-runtime-2", source: "public_conversion" },
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

  it("reports conversion_failed when selector shape cannot be converted", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: "internal:has-text=/dynamic/",
          kind: "internal",
          source: "manual",
        },
        stepNumber: 7,
      },
      {
        resolveLocatorFn: () => locatorStub({ count: 1 }),
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

  it("reports unavailable when runtime match counting fails", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 4,
      },
      {
        resolveLocatorFn: () =>
          ({
            count: async () => {
              throw new Error("count failed");
            },
          }) as unknown as Locator,
      }
    );

    expect(result.candidates).toEqual([]);
    expect(result.runtimeUnique).toBe(false);
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "selector_repair_playwright_runtime_unavailable"
      )
    ).toBe(true);
  });

  it("deduplicates duplicate runtime repair candidates and keeps one source marker", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 9,
      },
      {
        resolveLocatorFn: () =>
          normalizedLocatorStub({
            count: 1,
            normalized: "getByRole('link', { name: 'Winterweer update' })",
          }),
        toLocatorExpressionFromSelectorFn: () =>
          "getByRole('link', { name: 'Winterweer update' })",
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.sourceMarkers).toHaveLength(1);
    expect(result.sourceMarkers[0]?.candidateId).toBe("repair-playwright-runtime-1");
    expect(result.sourceMarkers[0]?.source).toBe("normalize");
  });

  it("falls back to public conversion when normalize() does not yield a supported locator expression", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer update"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 12,
      },
      {
        resolveLocatorFn: () =>
          normalizedLocatorStub({
            count: 1,
            normalized: "internal:role=link[name=Winterweer update i]",
          }),
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.target.value).toBe(
      "getByRole('link', { name: 'Winterweer update' })"
    );
    expect(result.sourceMarkers).toEqual([
      { candidateId: "repair-playwright-runtime-1", source: "public_conversion" },
    ]);
  });

  it("derives dynamic signals from the target when they are not provided", async () => {
    const result = await generateRuntimeRepairCandidates(
      {
        page: pageStub(),
        target: {
          value: 'internal:role=link[name="Winterweer liveblog Schiphol 12:30"i]',
          kind: "internal",
          source: "manual",
        },
        stepNumber: 10,
      },
      {
        resolveLocatorFn: () => locatorStub({ count: 1 }),
        toLocatorExpressionFromSelectorFn: () =>
          "getByRole('link', { name: /winterweer.*schiphol/i })",
      }
    );

    expect(result.dynamicSignals).toEqual(
      expect.arrayContaining(["contains_weather_or_news_fragment"])
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.reasonCodes).toContain("locator_repair_playwright_runtime");
  });
});
