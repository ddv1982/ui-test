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

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_volatile")).toBe(true);
    expect(out.candidates.some((candidate) =>
      candidate.reasonCodes.includes("locator_repair_remove_exact")
    )).toBe(true);
    expect(out.candidates.some((candidate) =>
      candidate.reasonCodes.includes("locator_repair_regex")
    )).toBe(true);
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
    expect(out.diagnostics[0]?.code).toBe("selector_target_flagged_volatile");
  });

  it("flags headline-like text as volatile", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Video Dolblije Erben Wennemars viert feest met schaatsploeg' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 4,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_volatile")).toBe(true);
    expect(out.diagnostics.some((d) => d.message.includes("contains_headline_like_text"))).toBe(true);
  });

  it("flags pipe-separated text as volatile", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Live Epstein | Trump vindt documenten' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 5,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_volatile")).toBe(true);
    expect(out.diagnostics.some((d) => d.message.includes("contains_pipe_separator"))).toBe(true);
  });

  it("flags text with 'live' or 'video' volatile keywords", () => {
    const out = analyzeAndBuildLocatorRepairCandidates({
      target: {
        value: "getByRole('link', { name: 'Video van vandaag' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
      stepNumber: 6,
    });

    expect(out.diagnostics.some((d) => d.code === "selector_target_flagged_volatile")).toBe(true);
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
  });
});
