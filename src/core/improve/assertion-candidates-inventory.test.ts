import { describe, expect, it } from "vitest";
import { buildSnapshotInventoryAssertionCandidates } from "./assertion-candidates-inventory.js";

describe("buildSnapshotInventoryAssertionCandidates", () => {
  it("builds candidates from post-step inventory even when delta is empty", () => {
    const snapshot = [
      "- generic [ref=e1]:",
      '  - heading "Welcome" [level=1] [ref=e2]',
      '  - navigation "Main menu" [ref=e3]',
    ].join("\n") + "\n";

    const out = buildSnapshotInventoryAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[1]?.candidate.action).toBe("assertVisible");
  });

  it("excludes noisy and acted-target-like nodes", () => {
    const out = buildSnapshotInventoryAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Submit' })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - heading "Submit" [level=1] [ref=e2]',
          '  - heading "12345" [level=2] [ref=e3]',
          '  - navigation "Main menu" [ref=e4]',
        ].join("\n") + "\n",
      },
    ]);

    expect(
      out.some(
        (candidate) =>
          candidate.candidate.action === "assertText" &&
          candidate.candidate.text === "Submit"
      )
    ).toBe(false);
    expect(
      out.some(
        (candidate) =>
          candidate.candidate.action === "assertText" &&
          candidate.candidate.text === "12345"
      )
    ).toBe(false);
    expect(
      out.some((candidate) => candidate.candidate.action === "assertVisible")
    ).toBe(true);
  });

  it("caps inventory output to two candidates per step", () => {
    const out = buildSnapshotInventoryAssertionCandidates([
      {
        index: 2,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - heading "Welcome" [level=1] [ref=e2]',
          '  - status "Saved" [ref=e3]',
          '  - navigation "Main menu" [ref=e4]',
          '  - dialog "Confirmation" [ref=e5]',
        ].join("\n") + "\n",
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out.every((candidate) => candidate.index === 2)).toBe(true);
  });

  it("emits expected source, fallback flag, rationale, and confidence", () => {
    const out = buildSnapshotInventoryAssertionCandidates([
      {
        index: 3,
        step: {
          action: "press",
          target: { value: "#search", kind: "css", source: "manual" },
          key: "Enter",
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - heading "Results" [level=1] [ref=e2]',
        ].join("\n") + "\n",
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.candidateSource).toBe("snapshot_native");
    expect(out[0]?.coverageFallback).toBe(true);
    expect(out[0]?.rationale.startsWith("Coverage fallback (inventory):")).toBe(true);
    expect(out[0]?.confidence).toBe(0.79);
  });
});
