import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import {
  insertAppliedAssertions,
  isDuplicateAdjacentAssertion,
  selectCandidatesForApply,
  validateCandidatesAgainstRuntime,
} from "./assertion-apply.js";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn(async () => {}),
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

describe("assertion apply helpers", () => {
  it("selects high-confidence candidates and skips low-confidence entries", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "fill",
          candidate: {
            action: "assertValue",
            target: { value: "#name", kind: "css", source: "manual" },
            value: "Alice",
          },
          confidence: 0.9,
          rationale: "high confidence",
        },
        {
          index: 1,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#done", kind: "css", source: "manual" },
          },
          confidence: 0.4,
          rationale: "low confidence",
        },
      ],
      0.75
    );

    expect(out.selected).toHaveLength(1);
    expect(out.selected[0]?.candidateIndex).toBe(0);
    expect(out.skippedLowConfidence).toHaveLength(1);
    expect(out.skippedLowConfidence[0]?.applyStatus).toBe("skipped_low_confidence");
  });

  it("inserts applied assertions with stable offsets", () => {
    const steps: Step[] = [
      { action: "navigate", url: "https://example.com" },
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
    ];

    const out = insertAppliedAssertions(steps, [
      {
        sourceIndex: 1,
        assertionStep: {
          action: "assertVisible",
          target: { value: "#dashboard", kind: "css", source: "manual" },
        },
      },
      {
        sourceIndex: 2,
        assertionStep: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
      },
    ]);

    expect(out).toHaveLength(5);
    expect(out[2]?.action).toBe("assertVisible");
    expect(out[4]?.action).toBe("assertValue");
  });

  it("detects adjacent duplicate assertions", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#submit", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#status", kind: "css", source: "manual" } },
    ];
    const duplicate = {
      action: "assertVisible",
      target: { value: "#status", kind: "css", source: "manual" },
    } as const;

    expect(isDuplicateAdjacentAssertion(steps, 0, duplicate)).toBe(true);
  });

  it("does not treat assertions as duplicates when framePath differs", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: { value: "#submit", kind: "css", source: "manual" },
      },
      {
        action: "assertVisible",
        target: {
          value: "#status",
          kind: "css",
          source: "manual",
          framePath: ["iframe#left"],
        },
      },
    ];
    const candidate = {
      action: "assertVisible",
      target: {
        value: "#status",
        kind: "css",
        source: "codegen-jsonl",
        framePath: ["iframe#right"],
      },
    } as const;

    expect(isDuplicateAdjacentAssertion(steps, 0, candidate)).toBe(false);
  });

  it("treats assertions as duplicates when only source differs", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: { value: "#submit", kind: "css", source: "manual" },
      },
      {
        action: "assertVisible",
        target: {
          value: "#status",
          kind: "css",
          source: "manual",
        },
      },
    ];
    const candidate = {
      action: "assertVisible",
      target: {
        value: "#status",
        kind: "css",
        source: "codegen-jsonl",
      },
    } as const;

    expect(isDuplicateAdjacentAssertion(steps, 0, candidate)).toBe(true);
  });

  it("validates runtime assertions and reports runtime failures", async () => {
    executeRuntimeStepMock.mockClear();
    executeRuntimeStepMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("expected text not found"));

    const steps: Step[] = [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }];
    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      steps,
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: { action: "assertVisible", target: { value: "#ok", kind: "css", source: "manual" } },
            confidence: 0.9,
            rationale: "stable visible state",
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertText",
              target: { value: "#status", kind: "css", source: "manual" },
              text: "Saved",
            },
            confidence: 0.9,
            rationale: "status text",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.applyStatus).toBe("applied");
    expect(outcomes[1]?.applyStatus).toBe("skipped_runtime_failure");
  });
});
