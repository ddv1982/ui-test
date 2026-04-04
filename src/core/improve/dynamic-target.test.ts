import { describe, expect, it } from "vitest";
import {
  assessTargetDynamics,
  extractLocatorExpressionTextFragments,
  extractRuntimeSelectorTextFragments,
  normalizeDynamicSignals,
} from "./dynamic-target.js";

describe("assessTargetDynamics", () => {
  it("detects dynamic signals for unquoted text= selectors", () => {
    const result = assessTargetDynamics({
      value: "text=Winterweer update Schiphol 12:30",
      kind: "playwrightSelector",
      source: "manual",
    });

    expect(result.isDynamic).toBe(true);
    expect(result.dynamicSignals).toContain("contains_weather_or_news_fragment");
    expect(result.dynamicSignals).toContain("contains_date_or_time_fragment");
  });

  it("marks exact headline role locators as dynamic", () => {
    const result = assessTargetDynamics({
      value:
        "getByRole('link', { name: 'Winterweer update Schiphol 12:30, alle vluchten vertraagd', exact: true })",
      kind: "locatorExpression",
      source: "manual",
    });

    expect(result.isDynamic).toBe(true);
    expect(result.dynamicSignals).toContain("exact_true");
    expect(result.dynamicSignals).toContain("contains_weather_or_news_fragment");
  });

  it("does not treat plain text containing 'Exact' as exact_true", () => {
    const result = assessTargetDynamics({
      value: "getByText('Exact Sciences')",
      kind: "locatorExpression",
      source: "manual",
    });

    expect(result.dynamicSignals).not.toContain("exact_true");
  });

  it("does not flag short stable button labels", () => {
    const result = assessTargetDynamics({
      value: "getByRole('button', { name: 'Opslaan' })",
      kind: "locatorExpression",
      source: "manual",
    });

    expect(result.isDynamic).toBe(false);
    expect(result.dynamicSignals).toEqual([]);
  });
});

describe("extractRuntimeSelectorTextFragments", () => {
  it("extracts unquoted text fragments from Playwright selector engines", () => {
    const fragments = extractRuntimeSelectorTextFragments(
      "text=Winterweer update Schiphol 12:30 >> nth=0"
    );

    expect(fragments).toContain("Winterweer update Schiphol 12:30");
  });

  it("extracts internal role names and quoted fragments", () => {
    const fragments = extractRuntimeSelectorTextFragments(
      `internal:role=link[name="Breaking News"i] >> text="Live blog"`
    );

    expect(fragments).toEqual(
      expect.arrayContaining(["Breaking News", "Live blog"])
    );
  });
});

describe("extractLocatorExpressionTextFragments", () => {
  it("extracts name/text fragments from locator expressions", () => {
    const fragments = extractLocatorExpressionTextFragments(
      "getByRole('button', { name: 'Save' })"
    );

    expect(fragments).toEqual(["Save"]);
  });
});

describe("normalizeDynamicSignals", () => {
  it("deduplicates and preserves supported signal values", () => {
    expect(
      normalizeDynamicSignals([
        "contains_weather_or_news_fragment",
        "contains_weather_or_news_fragment",
        "exact_true",
      ])
    ).toEqual(["contains_weather_or_news_fragment", "exact_true"]);
  });
});
