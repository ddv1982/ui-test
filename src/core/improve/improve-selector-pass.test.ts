import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";

const {
  scoreTargetCandidatesMock,
  shouldAdoptCandidateMock,
  executeRuntimeStepMock,
  dismissCookieBannerWithDetailsMock,
  waitForPostStepNetworkIdleMock,
  generateRuntimeRepairCandidatesMock,
} = vi.hoisted(() => ({
  scoreTargetCandidatesMock: vi.fn<
    typeof import("./candidate-scorer.js").scoreTargetCandidates
  >(),
  shouldAdoptCandidateMock: vi.fn<
    typeof import("./candidate-scorer.js").shouldAdoptCandidate
  >(),
  executeRuntimeStepMock: vi.fn<
    typeof import("../runtime/step-executor.js").executeRuntimeStep
  >(async () => {}),
  dismissCookieBannerWithDetailsMock: vi.fn<
    typeof import("../runtime/cookie-banner.js").dismissCookieBannerWithDetails
  >(async () => ({ dismissed: false })),
  waitForPostStepNetworkIdleMock: vi.fn<
    typeof import("../runtime/network-idle.js").waitForPostStepNetworkIdle
  >(async () => false),
  generateRuntimeRepairCandidatesMock: vi.fn<
    typeof import("./selector-runtime-repair.js").generateRuntimeRepairCandidates
  >(async () => ({
    candidates: [],
    diagnostics: [],
    dynamicSignals: [],
    runtimeUnique: false,
    sourceMarkers: [],
  })),
}));

vi.mock("./candidate-scorer.js", () => ({
  scoreTargetCandidates: scoreTargetCandidatesMock,
  shouldAdoptCandidate: shouldAdoptCandidateMock,
}));

vi.mock("./candidate-generator-aria.js", () => ({
  generateAriaTargetCandidates: vi.fn(async () => ({ candidates: [], diagnostics: [] })),
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/cookie-banner.js", () => ({
  dismissCookieBannerWithDetails: dismissCookieBannerWithDetailsMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  DEFAULT_WAIT_FOR_NETWORK_IDLE: true,
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
}));

vi.mock("./selector-runtime-repair.js", () => ({
  generateRuntimeRepairCandidates: generateRuntimeRepairCandidatesMock,
}));

import { runImproveSelectorPass } from "./improve-selector-pass.js";

function pageStub(): Page {
  return {} as Page;
}

describe("runImproveSelectorPass", () => {
  beforeEach(() => {
    scoreTargetCandidatesMock.mockReset();
    shouldAdoptCandidateMock.mockReset();
    executeRuntimeStepMock.mockReset();
    dismissCookieBannerWithDetailsMock.mockReset();
    waitForPostStepNetworkIdleMock.mockReset();
    generateRuntimeRepairCandidatesMock.mockReset();

    executeRuntimeStepMock.mockImplementation(async () => {});
    dismissCookieBannerWithDetailsMock.mockResolvedValue({ dismissed: false });
    waitForPostStepNetworkIdleMock.mockResolvedValue(false);
    shouldAdoptCandidateMock.mockReturnValue(false);
    generateRuntimeRepairCandidatesMock.mockResolvedValue({
      candidates: [],
      diagnostics: [],
      dynamicSignals: [],
      runtimeUnique: false,
      sourceMarkers: [],
    });
    delete process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN"];
  });

  it("adds dynamic runtime repair candidates and applies them when selected", async () => {
    const runtimeCandidateValue =
      "getByRole('link', { name: /winterweer.*liveblog/i })";
    generateRuntimeRepairCandidatesMock.mockResolvedValueOnce({
      candidates: [
        {
          id: "repair-playwright-runtime-1",
          source: "derived",
          target: {
            value: runtimeCandidateValue,
            kind: "locatorExpression",
            source: "manual",
          },
          reasonCodes: ["locator_repair_playwright_runtime"],
          dynamicSignals: ["contains_weather_or_news_fragment"],
        },
      ],
      diagnostics: [
        {
          code: "selector_repair_generated_via_playwright_runtime",
          level: "info",
          message: "generated",
        },
      ],
      dynamicSignals: ["contains_weather_or_news_fragment"],
      runtimeUnique: true,
      sourceMarkers: [
        {
          candidateId: "repair-playwright-runtime-1",
          source: "public_conversion",
        },
      ],
    });

    scoreTargetCandidatesMock.mockImplementationOnce(async (_page, candidates) => {
      const current = candidates.find((candidate) => candidate.source === "current");
      const runtime = candidates.find((candidate) =>
        candidate.reasonCodes.includes("locator_repair_playwright_runtime")
      );
      if (!current || !runtime) {
        throw new Error("Expected both current and runtime repair candidates");
      }
      return [
        {
          candidate: runtime,
          score: 0.9,
          baseScore: 0.9,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["locator_repair_playwright_runtime", "unique_match"],
        },
        {
          candidate: current,
          score: 0.2,
          baseScore: 0.2,
          uniquenessScore: 1,
          visibilityScore: 0,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["existing_target", "dynamic_target"],
        },
      ];
    });
    shouldAdoptCandidateMock.mockReturnValueOnce(true);

    const steps: Step[] = [
      {
        action: "click",
        target: {
          value:
            "getByRole('link', { name: 'Winterweer liveblog: Schiphol geannuleerd', exact: true })",
          kind: "locatorExpression",
          source: "manual",
        },
      },
    ];

    const result = await runImproveSelectorPass({
      steps,
      outputStepOriginalIndexes: [0],
      page: pageStub(),
      applySelectors: true,
      wantsNativeSnapshots: false,
      diagnostics: [],
    });

    expect(generateRuntimeRepairCandidatesMock).toHaveBeenCalledTimes(1);
    expect(result.selectorRepairsGeneratedByPlaywrightRuntime).toBe(1);
    expect(result.selectorRepairsAppliedFromPlaywrightRuntime).toBe(1);
    expect(result.outputSteps[0]).toMatchObject({
      action: "click",
      target: {
        value: runtimeCandidateValue,
      },
    });
  });

  it("runs runtime repair for dynamic internal selectors", async () => {
    generateRuntimeRepairCandidatesMock.mockResolvedValueOnce({
      candidates: [
        {
          id: "repair-playwright-runtime-1",
          source: "derived",
          target: {
            value: "getByRole('link', { name: /winterweer\\s+update/i })",
            kind: "locatorExpression",
            source: "manual",
          },
          reasonCodes: ["locator_repair_playwright_runtime"],
          dynamicSignals: ["contains_weather_or_news_fragment"],
        },
      ],
      diagnostics: [],
      dynamicSignals: ["contains_weather_or_news_fragment"],
      runtimeUnique: true,
      sourceMarkers: [
        {
          candidateId: "repair-playwright-runtime-1",
          source: "public_conversion",
        },
      ],
    });

    scoreTargetCandidatesMock.mockImplementationOnce(async (_page, candidates) => {
      const current = candidates.find((candidate) => candidate.source === "current");
      const runtime = candidates.find((candidate) =>
        candidate.reasonCodes.includes("locator_repair_playwright_runtime")
      );
      if (!current || !runtime) {
        throw new Error("Expected both current and runtime candidates");
      }
      return [
        {
          candidate: runtime,
          score: 0.9,
          baseScore: 0.9,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["locator_repair_playwright_runtime", "unique_match"],
        },
        {
          candidate: current,
          score: 0.3,
          baseScore: 0.3,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["existing_target", "dynamic_target"],
        },
      ];
    });
    shouldAdoptCandidateMock.mockReturnValueOnce(true);

    await runImproveSelectorPass({
      steps: [
        {
          action: "click",
          target: {
            value: 'internal:role=link[name="Winterweer update Schiphol 12:30"i]',
            kind: "internal",
            source: "manual",
          },
        },
      ],
      outputStepOriginalIndexes: [0],
      page: pageStub(),
      applySelectors: true,
      wantsNativeSnapshots: false,
      diagnostics: [],
    });

    expect(generateRuntimeRepairCandidatesMock).toHaveBeenCalledTimes(1);
    expect(generateRuntimeRepairCandidatesMock.mock.calls[0]?.[0]).toMatchObject({
      target: {
        kind: "internal",
      },
    });
  });

  it("does not invoke runtime repair for non-dynamic targets", async () => {
    scoreTargetCandidatesMock.mockImplementationOnce(async (_page, candidates) => {
      const current = candidates.find((candidate) => candidate.source === "current");
      if (!current) {
        throw new Error("Expected current candidate");
      }
      return [
        {
          candidate: current,
          score: 0.8,
          baseScore: 0.8,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["existing_target", "unique_match"],
        },
      ];
    });

    const result = await runImproveSelectorPass({
      steps: [
        {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Opslaan' })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      outputStepOriginalIndexes: [0],
      page: pageStub(),
      applySelectors: false,
      wantsNativeSnapshots: false,
      diagnostics: [],
    });

    expect(generateRuntimeRepairCandidatesMock).not.toHaveBeenCalled();
    expect(result.selectorRepairsGeneratedByPlaywrightRuntime).toBe(0);
    expect(result.selectorRepairsAppliedFromPlaywrightRuntime).toBe(0);
  });

  it("skips runtime repair when env kill switch is enabled", async () => {
    process.env["UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN"] = "1";

    scoreTargetCandidatesMock.mockImplementationOnce(async (_page, candidates) => {
      const current = candidates.find((candidate) => candidate.source === "current");
      if (!current) {
        throw new Error("Expected current candidate");
      }
      return [
        {
          candidate: current,
          score: 0.7,
          baseScore: 0.7,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["existing_target", "dynamic_target"],
        },
      ];
    });

    const diagnostics: Array<{ code: string; level: "info" | "warn" | "error"; message: string }> =
      [];
    await runImproveSelectorPass({
      steps: [
        {
          action: "click",
          target: {
            value:
              "getByRole('link', { name: 'Winterweer update Schiphol 12:30', exact: true })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      outputStepOriginalIndexes: [0],
      page: pageStub(),
      applySelectors: true,
      wantsNativeSnapshots: false,
      diagnostics,
    });

    expect(generateRuntimeRepairCandidatesMock).not.toHaveBeenCalled();
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "selector_repair_playwright_runtime_disabled"
      )
    ).toBe(true);
  });

  it("deduplicates candidates by value + kind + framePath regardless of target source", async () => {
    generateRuntimeRepairCandidatesMock.mockResolvedValueOnce({
      candidates: [
        {
          id: "repair-playwright-runtime-1",
          source: "derived",
          target: {
            value:
              "getByRole('link', { name: 'Winterweer update Schiphol 12:30' })",
            kind: "locatorExpression",
            source: "manual",
          },
          reasonCodes: ["locator_repair_playwright_runtime"],
          dynamicSignals: ["contains_weather_or_news_fragment"],
        },
      ],
      diagnostics: [],
      dynamicSignals: ["contains_weather_or_news_fragment"],
      runtimeUnique: true,
      sourceMarkers: [
        {
          candidateId: "repair-playwright-runtime-1",
          source: "public_conversion",
        },
      ],
    });

    scoreTargetCandidatesMock.mockImplementationOnce(async (_page, candidates) => {
      const matchingCandidates = candidates.filter(
        (candidate) =>
          candidate.target.value ===
          "getByRole('link', { name: 'Winterweer update Schiphol 12:30' })"
      );
      expect(matchingCandidates).toHaveLength(1);
      const current = candidates.find((candidate) => candidate.source === "current");
      if (!current) throw new Error("Expected current candidate");
      return [
        {
          candidate: current,
          score: 0.6,
          baseScore: 0.6,
          uniquenessScore: 1,
          visibilityScore: 1,
          matchCount: 1,
          runtimeChecked: true,
          reasonCodes: ["existing_target", "dynamic_target"],
        },
      ];
    });

    await runImproveSelectorPass({
      steps: [
        {
          action: "click",
          target: {
            value:
              "getByRole('link', { name: 'Winterweer update Schiphol 12:30' })",
            kind: "locatorExpression",
            source: "codegen-jsonl",
          },
        },
      ],
      outputStepOriginalIndexes: [0],
      page: pageStub(),
      applySelectors: false,
      wantsNativeSnapshots: false,
      diagnostics: [],
    });

    expect(generateRuntimeRepairCandidatesMock).toHaveBeenCalledTimes(1);
  });
});
