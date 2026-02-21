import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import {
  insertAppliedAssertions,
  isDuplicateAdjacentAssertion,
  selectCandidatesForApply,
  validateCandidatesAgainstRuntime,
} from "./assertion-apply.js";
import { ASSERTION_POLICY_CONFIG } from "./assertion-policy.js";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn<
    typeof import("../runtime/step-executor.js").executeRuntimeStep
  >(async () => {}),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn<
    typeof import("../runtime/network-idle.js").waitForPostStepNetworkIdle
  >(async () => false),
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  DEFAULT_WAIT_FOR_NETWORK_IDLE: true,
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
}));

function getExecutedStepAt(callIndex: number): Step {
  const call = executeRuntimeStepMock.mock.calls[callIndex];
  expect(call).toBeDefined();
  return call![1];
}

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

  it("allows stable structural snapshot assertVisible through policy", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "getByRole('navigation', { name: 'Main menu' })", kind: "locatorExpression", source: "codegen-fallback" },
          },
          confidence: 0.84,
          rationale: "stable structural element",
          candidateSource: "snapshot_native",
          stableStructural: true,
        },
      ],
      0.75
    );

    expect(out.selected).toHaveLength(1);
    expect(out.skippedPolicy).toHaveLength(0);
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
      0.75,
      {
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(out.selected).toHaveLength(1);
    expect(out.selected[0]?.candidate.candidate.action).toBe("assertText");
    expect(out.skippedPolicy).toHaveLength(1);
    expect(out.skippedPolicy[0]?.applyStatus).toBe("skipped_policy");
  });

  it("allows snapshot assertVisible candidates in default balanced mode", () => {
    const out = selectCandidatesForApply(
      [
        {
          index: 0,
          afterAction: "click",
          candidate: {
            action: "assertVisible",
            target: { value: "#status", kind: "css", source: "manual" },
          },
          confidence: 0.9,
          rationale: "snapshot visible candidate",
          candidateSource: "snapshot_native",
        },
      ],
      0.75
    );

    expect(out.selected).toHaveLength(1);
    expect(out.skippedPolicy).toHaveLength(0);
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
    const candidate: Step = {
      action: "assertVisible",
      target: {
        value: "#status",
        kind: "css",
        source: "codegen-jsonl",
        framePath: ["iframe#right"],
      },
    };

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
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
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
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = getExecutedStepAt(1);
    expect(firstAppliedStep.action).toBe("assertValue");
  });

  it("prefers assertText over assertValue when confidence is tied in balanced mode", async () => {
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
            confidence: 0.9,
            rationale: "value assertion",
            candidateSource: "deterministic",
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
            rationale: "text assertion",
            candidateSource: "snapshot_native",
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.balanced,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    const firstAppliedStep = getExecutedStepAt(1);
    expect(firstAppliedStep.action).toBe("assertText");
  });

  it("prefers higher stability score even when confidence is lower", async () => {
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
            confidence: 0.84,
            stabilityScore: 0.70,
            rationale: "stable visible fallback",
            candidateSource: "snapshot_native",
            stableStructural: true,
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
            confidence: 0.82,
            stabilityScore: 0.92,
            rationale: "more stable text assertion",
            candidateSource: "snapshot_native",
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = getExecutedStepAt(1);
    expect(firstAppliedStep.action).toBe("assertText");
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
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = getExecutedStepAt(1);
    expect(firstAppliedStep.action).toBe("assertVisible");
    if (firstAppliedStep.action === "assertVisible") {
      expect(firstAppliedStep.target.value).toBe("#from-deterministic");
    }
  });

  it("prefers deterministic coverage fallback over inventory fallback for the same step", async () => {
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
              target: { value: "#inventory", kind: "css", source: "manual" },
            },
            confidence: 0.91,
            rationale: "inventory fallback",
            candidateSource: "snapshot_native",
            coverageFallback: true,
          },
        },
        {
          candidateIndex: 1,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#interacted", kind: "css", source: "manual" },
            },
            confidence: 0.76,
            rationale: "deterministic coverage fallback",
            candidateSource: "deterministic",
            coverageFallback: true,
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = getExecutedStepAt(1);
    expect(firstAppliedStep.action).toBe("assertVisible");
    if (firstAppliedStep.action === "assertVisible") {
      expect(firstAppliedStep.target.value).toBe("#interacted");
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
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("skipped_policy");
    const firstAppliedStep = getExecutedStepAt(1);
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
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.reliable,
      }
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("skipped_policy");
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);
  });

  it("allows up to two applied assertions per source step in balanced mode", async () => {
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
            rationale: "value assertion",
            candidateSource: "deterministic",
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
            rationale: "text assertion",
            candidateSource: "snapshot_native",
          },
        },
        {
          candidateIndex: 2,
          candidate: {
            index: 0,
            afterAction: "click",
            candidate: {
              action: "assertVisible",
              target: { value: "#status", kind: "css", source: "manual" },
            },
            confidence: 0.89,
            rationale: "visible assertion",
            candidateSource: "snapshot_native",
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.balanced,
      }
    );

    expect(outcomes).toHaveLength(3);
    expect(outcomes.filter((item) => item.applyStatus === "applied")).toHaveLength(2);
    expect(outcomes.filter((item) => item.applyStatus === "skipped_policy")).toHaveLength(1);
  });

  it("treats coverage fallback assertions as backup-only once a stronger assertion applies", async () => {
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
              action: "assertText",
              target: { value: "#status", kind: "css", source: "manual" },
              text: "Saved",
            },
            confidence: 0.9,
            rationale: "stronger text assertion",
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
              target: { value: "#save", kind: "css", source: "manual" },
            },
            confidence: 0.76,
            rationale: "deterministic coverage fallback",
            candidateSource: "deterministic",
            coverageFallback: true,
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.balanced,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe("applied");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("skipped_policy");
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyMessage).toContain(
      "coverage fallback assertions are backup-only"
    );
  });

  it("applies coverage fallback when stronger assertion fails runtime validation", async () => {
    executeRuntimeStepMock.mockImplementation(async (_page, step) => {
      if ((step as Step).action === "assertText") {
        throw new Error("text not stable");
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
              action: "assertText",
              target: { value: "#status", kind: "css", source: "manual" },
              text: "Saved",
            },
            confidence: 0.9,
            rationale: "stronger text assertion",
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
              target: { value: "#save", kind: "css", source: "manual" },
            },
            confidence: 0.76,
            rationale: "deterministic coverage fallback",
            candidateSource: "deterministic",
            coverageFallback: true,
          },
        },
      ],
      {
        timeout: 1000,
        policyConfig: ASSERTION_POLICY_CONFIG.balanced,
      }
    );

    expect(outcomes.find((item) => item.candidateIndex === 0)?.applyStatus).toBe(
      "skipped_runtime_failure"
    );
    expect(outcomes.find((item) => item.candidateIndex === 1)?.applyStatus).toBe("applied");
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
