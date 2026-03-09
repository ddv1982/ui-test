import { describe, expect, it } from "vitest";
import { analyzeAndBuildLocatorRepairCandidates } from "./locator-repair.js";

describe("analyzeAndBuildLocatorRepairCandidates", () => {
  it("creates repair candidates for brittle exact getByRole targets", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value:
          "getByRole('link', { name: 'Tientallen vluchten op Schiphol uit voorzorg geschrapt vanwege winterweer', exact: true })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 7,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_dynamic")).toBe(true);
    expect(out.dynamicTarget).toBe(true);
    expect(out.dynamicSignals).toContain("exact_true");
    expect(out.candidates.some((candidate) =>
      candidate.reasonCodes.includes("locator_repair_remove_exact")
    )).toBe(true);
    expect(out.candidates.some((candidate) =>
      candidate.reasonCodes.includes("locator_repair_regex")
    )).toBe(true);
    expect(out.candidates.every((candidate) =>
      (candidate.dynamicSignals ?? []).includes("exact_true")
    )).toBe(false);
  });

  it("reports unsupported expression shapes without generating repair candidates", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Winterweer update', exact: true }).filter({ hasText: 'winterweer' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 3,
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0]?.code).toBe("selector_target_flagged_dynamic");
    expect(out.dynamicTarget).toBe(true);
    expect(out.dynamicSignals).toContain("unsupported_expression_shape");
  });

  it("flags headline-like text as dynamic", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Video Dolblije Erben Wennemars viert feest met schaatsploeg' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 4,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_dynamic")).toBe(true);
    expect(out.diagnostics.some((d) => d.message.includes("contains_headline_like_text"))).toBe(true);
  });

  it("flags pipe-separated text as dynamic", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Live Epstein | Trump vindt documenten' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 5,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_dynamic")).toBe(true);
    expect(out.diagnostics.some((d) => d.message.includes("contains_pipe_separator"))).toBe(true);
  });

  it("flags text with 'live' or 'video' dynamic keywords", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Video van vandaag' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 6,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_dynamic")).toBe(true);
  });

  it("does not flag short stable text as headline-like", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('button', { name: 'Submit form' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 1,
    });

    expect(out.diagnostics).toHaveLength(0);
    expect(out.candidates).toHaveLength(0);
    expect(out.dynamicTarget).toBe(false);
    expect(out.dynamicSignals).toHaveLength(0);
  });

  it("returns no repair candidates for non-locator targets", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "button.submit",
        kind: "css",
        source: "manual",
      },
      stepNumber: 2,
    });

    expect(out).toEqual({
      candidates: [],
      diagnostics: [],
      dynamicTarget: false,
      dynamicSignals: [],
    });
  });

  it("keeps framePath and nth suffix when repairing exact text locators", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByText('Breaking News 123', { exact: true }).nth(2)",
        kind: "locatorExpression",
        source: "manual",
        framePath: ["iframe[name='embedded']"],
      },
      stepNumber: 8,
    });

    expect(out.dynamicSignals).toEqual(
      expect.arrayContaining(["exact_true", "contains_numeric_fragment", "contains_weather_or_news_fragment"])
    );
    expect(out.candidates).toEqual([
      expect.objectContaining({
        reasonCodes: ["locator_repair_remove_exact"],
        target: expect.objectContaining({
          value: "getByText('Breaking News 123').nth(2)",
          framePath: ["iframe[name='embedded']"],
        }),
      }),
      expect.objectContaining({
        reasonCodes: ["locator_repair_regex"],
        target: expect.objectContaining({
          value: "getByText(/news/i).nth(2)",
        }),
      }),
      expect.objectContaining({
        reasonCodes: ["locator_repair_filter_has_text"],
        target: expect.objectContaining({
          value: "getByText(/news/i).filter({ hasText: /news/i }).nth(2)",
        }),
      }),
    ]);
  });

  it("supports repairing getByLabel expressions with last suffix when only exact removal is viable", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByLabel('Breaking update: 2026-03-09', { exact: true }).last()",
        kind: "locatorExpression",
        source: "manual",
      },
      stepNumber: 9,
    });

    expect(out.dynamicTarget).toBe(true);
    expect(out.dynamicSignals).toEqual(
      expect.arrayContaining([
        "exact_true",
        "contains_date_or_time_fragment",
        "contains_weather_or_news_fragment",
      ])
    );
    expect(out.candidates).toEqual([
      expect.objectContaining({
        reasonCodes: ["locator_repair_remove_exact"],
        target: expect.objectContaining({
          value: "getByLabel('Breaking update: 2026-03-09').last()",
        }),
      }),
    ]);
  });

  it("keeps distinct exact-removal, regex, and filter candidates when each target differs", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByPlaceholder('status', { exact: true })",
        kind: "locatorExpression",
        source: "manual",
      },
      stepNumber: 10,
    });

    expect(out.dynamicSignals).toContain("exact_true");
    expect(out.candidates).toHaveLength(3);
    expect(out.candidates[0]?.target.value).toBe("getByPlaceholder('status')");
    expect(out.candidates[1]?.target.value).toBe("getByPlaceholder(/status/i)");
    expect(out.candidates[2]?.target.value).toBe(
      "getByPlaceholder(/status/i).filter({ hasText: /status/i })"
    );
    expect(out.candidates.map((candidate) => candidate.reasonCodes[0])).toEqual([
      "locator_repair_remove_exact",
      "locator_repair_regex",
      "locator_repair_filter_has_text",
    ]);
  });

  it("returns dynamic analysis without candidates when regex repair has no stable tokens", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByTitle('Live 2026', { exact: true })",
        kind: "locatorExpression",
        source: "manual",
      },
      stepNumber: 11,
    });

    expect(out.dynamicTarget).toBe(true);
    expect(out.dynamicSignals).toEqual(
      expect.arrayContaining([
        "exact_true",
        "contains_numeric_fragment",
        "contains_weather_or_news_fragment",
      ])
    );
    expect(out.candidates).toEqual([
      expect.objectContaining({
        reasonCodes: ["locator_repair_remove_exact"],
        target: expect.objectContaining({ value: "getByTitle('Live 2026')" }),
      }),
    ]);
  });

  it("treats malformed exact option values as unsupported brittle expressions", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByText('Breaking News', { exact: 'yes' })",
        kind: "locatorExpression",
        source: "manual",
      },
      stepNumber: 12,
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.dynamicTarget).toBe(true);
    expect(out.dynamicSignals).toEqual(["unsupported_expression_shape"]);
    expect(out.diagnostics[0]?.message).toContain("unsupported");
  });
});
