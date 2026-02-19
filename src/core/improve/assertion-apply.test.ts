import { beforeEach, describe, expect, it, vi } from "vitest";
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
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn(async () => false),
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  DEFAULT_WAIT_FOR_NETWORK_IDLE: true,
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
}));

describe("assertion apply helpers", () => {
  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    waitForPostStepNetworkIdleMock.mockClear();
    waitForPostStepNetworkIdleMock.mockResolvedValue(false);
  });

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

  it("does not select low-confidence candidates without overrides", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#status", kind: "css", source: "manual" },
          },
          confidence: 0.3,
          rationale: "low confidence",
        },
      ],
      0.75
    );

    expect(out.selected).toHaveLength(0);
    expect(out.skippedLowConfidence).toHaveLength(1);
    expect(out.skippedLowConfidence[0]?.applyStatus).toBe("skipped_low_confidence");
  });

  it("supports per-candidate thresholds, forced policy, and stability-score selection", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertText",
            target: { value: "#status", kind: "css", source: "manual" },
            text: "Winterweer update",
          },
          confidence: 0.99,
          stabilityScore: 0.61,
          rationale: "volatile text",
          candidateSource: "snapshot_native",
        },
        {
          index: 1,
          afterAction: "fill",
          candidate: {
            action: "assertValue",
            target: { value: "#name", kind: "css", source: "manual" },
            value: "Alice",
          },
          confidence: 0.76,
          stabilityScore: 0.9,
          rationale: "stable form value",
          candidateSource: "deterministic",
        },
      ],
      0.75,
      {
        useStabilityScore: true,
        perCandidateMinConfidence: (candidate) =>
          candidate.candidateSource === "snapshot_native" ? 0.86 : 0.75,
        forcedPolicyMessages: new Map([[0, "forced-policy"]]),
      }
    );

    expect(out.selected).toHaveLength(1);
    expect(out.selected[0]?.candidateIndex).toBe(1);
    expect(out.skippedPolicy).toHaveLength(1);
    expect(out.skippedPolicy[0]?.applyMessage).toBe("forced-policy");
  });

  it("marks snapshot-derived assertVisible candidates as skipped_policy during selection", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#status", kind: "css", source: "manual" },
          },
          confidence: 0.99,
          rationale: "snapshot visible candidate",
          candidateSource: "snapshot_native",
        },
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertText",
            target: { value: "#status", kind: "css", source: "manual" },
            text: "Saved",
          },
          confidence: 0.99,
          rationale: "snapshot text candidate",
          candidateSource: "snapshot_native",
        },
      ],
      0.75
    );

    expect(out.selected).toHaveLength(1);
    expect(out.selected[0]?.candidate.candidate.action).toBe("assertText");
    expect(out.skippedPolicy).toHaveLength(1);
    expect(out.skippedPolicy[0]?.applyStatus).toBe("skipped_policy");
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

  it("attempts lower-ranked candidates when a higher-ranked candidate fails runtime validation", async () => {
    executeRuntimeStepMock.mockImplementation(async (_page, step) => {
      if ((step as { action: string }).action === "assertVisible") {
        throw new Error("expected element not visible");
      }
    });

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
              action: "assertChecked",
              target: { value: "#agree", kind: "css", source: "manual" },
              checked: true,
            },
            confidence: 0.85,
            rationale: "fallback checkbox state",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_runtime_failure");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(waitForPostStepNetworkIdleMock).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("prefers higher-priority assertion action when confidence is tied", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#status", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "visible fallback",
            candidateSource: "deterministic",
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertValue",
              target: { value: "#name", kind: "css", source: "manual" },
              value: "Alice",
            },
            confidence: 0.9,
            rationale: "value assertion",
            candidateSource: "snapshot_native",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = executeRuntimeStepMock.mock.calls[1]?.[1] as Step;
    expect(firstAppliedStep.action).toBe("assertValue");
  });

  it("prefers deterministic source when confidence and action are tied", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#from-snapshot", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "snapshot candidate",
            candidateSource: "snapshot_native",
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#from-deterministic", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "deterministic candidate",
            candidateSource: "deterministic",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = executeRuntimeStepMock.mock.calls[1]?.[1] as Step;
    expect(firstAppliedStep.action).toBe("assertVisible");
    if (firstAppliedStep.action === "assertVisible") {
      expect(firstAppliedStep.target.value).toBe("#from-deterministic");
    }
  });

  it("uses candidate index as stable tie-breaker when confidence, action, and source are tied", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#first", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "first",
            candidateSource: "deterministic",
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#second", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "second",
            candidateSource: "deterministic",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = executeRuntimeStepMock.mock.calls[1]?.[1] as Step;
    expect(firstAppliedStep.action).toBe("assertVisible");
    if (firstAppliedStep.action === "assertVisible") {
      expect(firstAppliedStep.target.value).toBe("#first");
    }
  });

  it("caps successful apply to one assertion per source step", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertValue",
              target: { value: "#name", kind: "css", source: "manual" },
              value: "Alice",
            },
            confidence: 0.95,
            rationale: "high confidence form assertion",
            candidateSource: "deterministic",
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#status", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "secondary visible state",
            candidateSource: "snapshot_native",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("skipped_policy");
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);
  });

  it("skips validation for a step when post-step network idle times out", async () => {
    executeRuntimeStepMock.mockResolvedValue(undefined);
    waitForPostStepNetworkIdleMock.mockResolvedValueOnce(true);

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#ok", kind: "css", source: "manual" },
            },
            confidence: 0.9,
            rationale: "status stays visible",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.applyStatus).toBe("skipped_runtime_failure");
    expect(outcomes[0]?.applyMessage).toContain("Post-step network idle wait timed out");
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(1);
  });

  it("keeps runtime-failing assertions as skipped_runtime_failure", async () => {
    executeRuntimeStepMock.mockImplementation(async (_page, step) => {
      if ((step as { action: string }).action === "assertVisible") {
        throw new Error("assertion runtime validation failed");
      }
    });

    const outcomes = await validateCandidatesAgainstRuntime(
      {} as Page,
      [{ action: "click", target: { value: "#save", kind: "css", source: "manual" } }],
      [
        {
          candidateIndex: 0,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#save", kind: "css", source: "manual" },
            },
            confidence: 0.8,
            rationale: "visible state",
          },
        },
      ],
      { timeout: 1000 }
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.applyStatus).toBe("skipped_runtime_failure");
    expect(outcomes[0]?.applyMessage).toContain("assertion runtime validation failed");
  });
});
