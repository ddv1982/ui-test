import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn(async () => {}),
}));
const { buildAssertionCandidatesMock } = vi.hoisted(() => ({
  buildAssertionCandidatesMock: vi.fn(() => []),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn(async () => false),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => ({
        addInitScript: vi.fn(async () => {}),
        newPage: vi.fn(async () => ({
          url: () => "about:blank",
          goto: vi.fn(async () => {}),
          waitForLoadState: vi.fn(async () => {}),
          locator: vi.fn(() => ({
            ariaSnapshot: vi.fn(async () => "- generic"),
          })),
        })),
        close: vi.fn(async () => {}),
      })),
      close: vi.fn(async () => {}),
    })),
  },
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("../runtime/network-idle.js", () => ({
  waitForPostStepNetworkIdle: waitForPostStepNetworkIdleMock,
  DEFAULT_WAIT_FOR_NETWORK_IDLE: true,
}));

vi.mock("./candidate-generator.js", () => ({
  generateTargetCandidates: vi.fn(() => [
    {
      id: "current-1",
      source: "current",
      target: { value: "#submit", kind: "css", source: "manual" },
      reasonCodes: ["existing_target"],
    },
    {
      id: "derived-1",
      source: "derived",
      target: { value: "getByRole('button', { name: 'Save' })", kind: "locatorExpression", source: "manual" },
      reasonCodes: ["derived_target"],
    },
  ]),
  quote: (value: string) =>
    "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'",
}));

vi.mock("./candidate-scorer.js", () => ({
  scoreTargetCandidates: vi.fn(async () => [
    {
      candidate: {
        id: "current-1",
        source: "current",
        target: { value: "#submit", kind: "css", source: "manual" },
        reasonCodes: ["existing_target"],
      },
      score: 0.2,
      baseScore: 0.2,
      uniquenessScore: 0.2,
      visibilityScore: 0,
      matchCount: 2,
      runtimeChecked: true,
      reasonCodes: ["existing_target"],
    },
    {
      candidate: {
        id: "derived-1",
        source: "derived",
        target: { value: "getByRole('button', { name: 'Save' })", kind: "locatorExpression", source: "manual" },
        reasonCodes: ["derived_target"],
      },
      score: 0.9,
      baseScore: 0.9,
      uniquenessScore: 1,
      visibilityScore: 1,
      matchCount: 1,
      runtimeChecked: true,
      reasonCodes: ["derived_target", "unique_match"],
    },
  ]),
  shouldAdoptCandidate: vi.fn(() => true),
}));

vi.mock("./candidate-generator-aria.js", () => ({
  generateAriaTargetCandidates: vi.fn(async () => ({ candidates: [], diagnostics: [] })),
}));

vi.mock("./assertion-candidates.js", () => ({
  buildAssertionCandidates: buildAssertionCandidatesMock,
}));

import { improveTestFile } from "./improve.js";
import { scoreTargetCandidates } from "./candidate-scorer.js";

describe("improve apply runtime replay", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    executeRuntimeStepMock.mockImplementation(async () => {});
    buildAssertionCandidatesMock.mockClear();
    buildAssertionCandidatesMock.mockReturnValue([]);
    waitForPostStepNetworkIdleMock.mockClear();
    waitForPostStepNetworkIdleMock.mockResolvedValue(false);
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("replays using updated step target after apply adoption", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);

    const secondStepArg = executeRuntimeStepMock.mock.calls[1]?.[1] as {
      action: string;
      target?: { value: string };
    };
    expect(secondStepArg.action).toBe("click");
    expect(secondStepArg.target?.value).toBe("getByRole('button', { name: 'Save' })");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("getByRole('button', { name: 'Save' })");
  });

  it("counts applied selector repairs when repair candidates are adopted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-repair-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        "      value: \"getByRole('link', { name: 'Winterweer update', exact: true })\"",
        "      kind: locatorExpression",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    vi.mocked(scoreTargetCandidates).mockResolvedValueOnce([
      {
        candidate: {
          id: "current-1",
          source: "current",
          target: {
            value: "getByRole('link', { name: 'Winterweer update', exact: true })",
            kind: "locatorExpression",
            source: "manual",
          },
          reasonCodes: ["existing_target"],
        },
        score: 0.2,
        baseScore: 0.2,
        uniquenessScore: 0.2,
        visibilityScore: 0,
        matchCount: 2,
        runtimeChecked: true,
        reasonCodes: ["existing_target"],
      },
      {
        candidate: {
          id: "repair-1",
          source: "derived",
          target: {
            value: "getByRole('link', { name: /winterweer.*update/i })",
            kind: "locatorExpression",
            source: "manual",
          },
          reasonCodes: ["locator_repair_regex"],
        },
        score: 0.9,
        baseScore: 0.9,
        uniquenessScore: 1,
        visibilityScore: 1,
        matchCount: 1,
        runtimeChecked: true,
        reasonCodes: ["locator_repair_regex", "unique_match"],
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.report.summary.selectorRepairsApplied).toBe(1);
    expect(result.report.diagnostics.some((d) => d.code === "selector_repair_applied")).toBe(true);
  });

  it("applies high-confidence assertion candidates with --apply", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-assertions-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: fill",
        "    target:",
        '      value: "#name"',
        "      kind: css",
        "      source: manual",
        "    text: Alice",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "fill",
        candidate: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
        confidence: 0.9,
        rationale: "stable input value",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("applied");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("action: assertValue");
    expect(saved).not.toContain("optional:");
  });

  it("applies selector and assertion updates in one run when both flags are enabled", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-both-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
        confidence: 0.9,
        rationale: "stable state check",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(result.report.summary.improved).toBeGreaterThan(0);
    expect(result.report.summary.assertionCandidates).toBe(1);
    expect(result.report.summary.appliedAssertions).toBe(1);

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("getByRole('button', { name: 'Save' })");
    expect(saved).toContain("action: assertValue");
    expect(saved).not.toContain("optional:");
  });

  it("skips low-confidence assertion candidates", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-assertions-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.6,
        rationale: "insufficient confidence",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_low_confidence");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).not.toContain("action: assertVisible");
  });

  it("expands candidate coverage for click/press/hover with deterministic fallbacks", async () => {
    const { buildAssertionCandidates } = await vi.importActual<
      typeof import("./assertion-candidates.js")
    >("./assertion-candidates.js");
    buildAssertionCandidatesMock.mockImplementation(buildAssertionCandidates);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-coverage-fallback-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#menu"',
        "      kind: css",
        "      source: manual",
        "  - action: press",
        "    target:",
        '      value: "#search"',
        "      kind: css",
        "      source: manual",
        "    key: Enter",
        "  - action: hover",
        "    target:",
        '      value: "#profile"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "deterministic",
    });

    expect(result.report.summary.assertionCoverageStepsTotal).toBe(3);
    expect(result.report.summary.assertionCoverageStepsWithCandidates).toBe(3);
    expect(result.report.summary.assertionCoverageStepsWithApplied).toBe(0);
    expect(result.report.summary.assertionCoverageCandidateRate).toBe(1);
    expect(result.report.summary.assertionCoverageAppliedRate).toBe(0);
    expect(result.report.assertionCandidates).toHaveLength(3);
    expect(
      result.report.assertionCandidates.every((candidate) => candidate.coverageFallback === true)
    ).toBe(true);
  });

  it("adds snapshot-native inventory candidates for weak/no-delta interaction steps", async () => {
    const { chromium } = await import("playwright");
    const { buildAssertionCandidates } = await vi.importActual<
      typeof import("./assertion-candidates.js")
    >("./assertion-candidates.js");
    buildAssertionCandidatesMock.mockImplementation(buildAssertionCandidates);

    const ariaSnapshotMock = vi.fn<[], Promise<string>>();
    ariaSnapshotMock.mockResolvedValueOnce("- generic");
    ariaSnapshotMock.mockResolvedValueOnce("- generic");
    const clickSnapshot = [
      "- generic [ref=e1]:",
      '  - button "Submit" [ref=e2]',
      '  - heading "Results" [level=1] [ref=e3]',
    ].join("\n");
    ariaSnapshotMock.mockResolvedValueOnce(clickSnapshot);
    ariaSnapshotMock.mockResolvedValueOnce(clickSnapshot);

    vi.mocked(chromium.launch).mockResolvedValueOnce({
      newContext: vi.fn(async () => ({
        addInitScript: vi.fn(async () => {}),
        newPage: vi.fn(async () => ({
          url: () => "about:blank",
          goto: vi.fn(async () => {}),
          waitForLoadState: vi.fn(async () => {}),
          locator: vi.fn(() => ({
            ariaSnapshot: ariaSnapshotMock,
          })),
        })),
        close: vi.fn(async () => {}),
      })),
      close: vi.fn(async () => {}),
    } as any);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-inventory-"));
    tempDirs.push(dir);
    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "snapshot-native",
    });

    expect(result.report.summary.assertionInventoryStepsEvaluated).toBe(1);
    expect((result.report.summary.assertionInventoryCandidatesAdded ?? 0)).toBeGreaterThan(0);
    expect(result.report.summary.assertionInventoryGapStepsFilled).toBe(1);
    expect(
      result.report.assertionCandidates.some(
        (candidate) =>
          candidate.candidateSource === "snapshot_native" &&
          candidate.coverageFallback === true &&
          candidate.candidate.action === "assertText"
      )
    ).toBe(true);
  });

  it("suppresses fallback apply when a stronger candidate exists on the same step", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-fallback-suppression-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#menu"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#menu", kind: "css", source: "manual" },
        },
        confidence: 0.76,
        rationale:
          "Coverage fallback: verify interacted element remains visible after action.",
        candidateSource: "deterministic",
        coverageFallback: true,
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#status", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.9,
        rationale: "stronger text candidate",
        candidateSource: "deterministic",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "balanced",
    });

    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(1);
    const fallbackCandidate = result.report.assertionCandidates.find(
      (candidate) => candidate.coverageFallback === true
    );
    expect(fallbackCandidate?.applyStatus).toBe("skipped_policy");
    expect(fallbackCandidate?.applyMessage).toContain(
      "coverage fallback suppressed because stronger candidate exists"
    );
  });

  it("keeps volatile snapshot text candidates report-only", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-assertions-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#news"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Winterweer 12:30 update' })", kind: "locatorExpression", source: "manual" },
          text: "Winterweer 12:30 update",
        },
        confidence: 0.98,
        rationale: "snapshot text",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.assertionCandidatesFilteredVolatile).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_policy");
    expect(
      result.report.diagnostics.some((diagnostic) => diagnostic.code === "assertion_candidate_filtered_volatile")
    ).toBe(true);

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).not.toContain("action: assertText");
  });

  it("keeps volume-capped snapshot candidates in report with skipped_policy", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-assertions-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#news"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Overview' })", kind: "locatorExpression", source: "manual" },
          text: "Overview",
        },
        confidence: 0.95,
        rationale: "snapshot text",
      },
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Status' })", kind: "locatorExpression", source: "manual" },
          text: "Status",
        },
        confidence: 0.94,
        rationale: "snapshot text",
      },
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Summary' })", kind: "locatorExpression", source: "manual" },
          text: "Summary",
        },
        confidence: 0.93,
        rationale: "snapshot text",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.assertionCandidates).toHaveLength(3);
    expect(
      result.report.assertionCandidates.some(
        (candidate) =>
          candidate.applyStatus === "skipped_policy" &&
          (candidate.applyMessage ?? "").includes("snapshot candidate cap reached")
      )
    ).toBe(true);
  });

  it("keeps volatile and capped snapshot candidates as not_requested in report-only mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-report-only-policy-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#news"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Winterweer 12:30 update' })", kind: "locatorExpression", source: "manual" },
          text: "Winterweer 12:30 update",
        },
        confidence: 0.98,
        rationale: "volatile snapshot text",
      },
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Overview' })", kind: "locatorExpression", source: "manual" },
          text: "Overview",
        },
        confidence: 0.95,
        rationale: "snapshot text",
      },
      {
        index: 1,
        afterAction: "click",
        candidateSource: "snapshot_native",
        candidate: {
          action: "assertText",
          target: { value: "getByRole('heading', { name: 'Summary' })", kind: "locatorExpression", source: "manual" },
          text: "Summary",
        },
        confidence: 0.94,
        rationale: "snapshot text",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    expect(result.report.assertionCandidates).toHaveLength(3);
    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.summary.assertionCandidatesFilteredVolatile).toBe(0);
    expect(result.report.assertionCandidates.every((candidate) => candidate.applyStatus === "not_requested")).toBe(true);
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "assertion_candidate_filtered_volatile"
      )
    ).toBe(false);
  });

  it("never applies runtime-failing assertions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-assertions-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    executeRuntimeStepMock.mockImplementation(async (_page, step) => {
      if ((step as { action: string }).action === "assertVisible") {
        throw new Error("Expected element to be visible");
      }
    });
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.85,
        rationale: "runtime validation candidate",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.summary.warnings).toBeGreaterThan(0);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_runtime_failure");
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "assertion_apply_runtime_failure"
      )
    ).toBe(true);
  });

  it("applies at most one assertion per source step", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-cap-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );
    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
        confidence: 0.95,
        rationale: "primary assertion",
        candidateSource: "deterministic",
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.9,
        rationale: "secondary assertion",
        candidateSource: "snapshot_native",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.assertionCandidates).toBe(2);
    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("applied");
    expect(result.report.assertionCandidates[1]?.applyStatus).toBe("skipped_policy");

    const saved = await fs.readFile(yamlPath, "utf-8");
    const appliedAssertCount = saved.match(/action: assert/g)?.length ?? 0;
    expect(appliedAssertCount).toBe(1);
  });

  it("adds snapshot-native assertion candidates when using default assertion source", async () => {
    const { chromium } = await import("playwright");

    const ariaSnapshotMock = vi.fn<[], Promise<string>>();
    // Navigate step: pre/post identical → no delta
    ariaSnapshotMock.mockResolvedValueOnce("- generic");
    ariaSnapshotMock.mockResolvedValueOnce("- generic");
    // Click step: new heading appears in post → delta produces candidate
    ariaSnapshotMock.mockResolvedValueOnce('- button "Submit"');
    ariaSnapshotMock.mockResolvedValueOnce('- button "Submit"\n- heading "Welcome"');

    vi.mocked(chromium.launch).mockResolvedValueOnce({
      newContext: vi.fn(async () => ({
        addInitScript: vi.fn(async () => {}),
        newPage: vi.fn(async () => ({
          url: () => "about:blank",
          goto: vi.fn(async () => {}),
          waitForLoadState: vi.fn(async () => {}),
          locator: vi.fn(() => ({
            ariaSnapshot: ariaSnapshotMock,
          })),
        })),
        close: vi.fn(async () => {}),
      })),
      close: vi.fn(async () => {}),
    } as any);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-snapshot-native-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    expect(result.report.summary.assertionCandidates).toBeGreaterThan(0);
    expect(result.report.assertionCandidates[0]?.candidateSource).toBe("snapshot_native");
  });

  it("continues analysis when native snapshot network-idle wait fails", async () => {
    waitForPostStepNetworkIdleMock.mockRejectedValueOnce(new Error("socket closed"));

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-snapshot-native-wait-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "runtime_network_idle_wait_failed"
      )
    ).toBe(true);
  });

  it("reports timeout warning when native snapshot network-idle wait times out", async () => {
    waitForPostStepNetworkIdleMock.mockResolvedValueOnce(true);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-snapshot-native-timeout-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "runtime_network_idle_wait_timed_out"
      )
    ).toBe(true);
  });

  it("keeps adjacent click visibility assertions without coverage diagnostics", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cleanup-apply-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
        "  - action: assertVisible",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(
      result.report.diagnostics.some((diagnostic) => diagnostic.code.startsWith("assertion_coverage_"))
    ).toBe(false);

    const saved = await fs.readFile(yamlPath, "utf-8");
    const matchCount = saved.match(/action: assertVisible/g)?.length ?? 0;
    expect(matchCount).toBe(1);
  });

  it("keeps existing assertions in replay execution", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cleanup-apply-replay-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
        "  - action: assertVisible",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const replayedActions = executeRuntimeStepMock.mock.calls.map((call) => {
      const step = call[1] as { action: string };
      return step.action;
    });
    expect(replayedActions.includes("assertVisible")).toBe(true);

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("action: assertVisible");
  });

  it("keeps finding indexes aligned for assertion apply with adjacent assertions", async () => {
    const { buildAssertionCandidates } = await vi.importActual<
      typeof import("./assertion-candidates.js")
    >("./assertion-candidates.js");
    buildAssertionCandidatesMock.mockImplementation(buildAssertionCandidates);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cleanup-indexes-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
        "  - action: assertVisible",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
        "  - action: fill",
        "    target:",
        '      value: "#name"',
        "      kind: css",
        "      source: manual",
        "    text: Alice",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.appliedAssertions).toBe(2);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.assertionCandidates).toHaveLength(2);
    const fillCandidate = result.report.assertionCandidates.find(
      (candidate) =>
        candidate.index === 3 &&
        candidate.candidate.action === "assertValue"
    );
    expect(fillCandidate?.candidate.action).toBe("assertValue");
    if (fillCandidate?.candidate.action === "assertValue") {
      expect(fillCandidate.candidate.target.value).toBe("getByRole('button', { name: 'Save' })");
      expect(fillCandidate.applyStatus).toBe("applied");
    }
    const fillFinding = result.report.stepFindings.find((finding) => finding.action === "fill");
    expect(fillFinding?.index).toBe(3);
  });

  it("does not emit coverage diagnostics in review mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cleanup-review-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: press",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
        "    key: Enter",
        "  - action: assertVisible",
        "    target:",
        '      value: "#login"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
    });

    expect(
      result.report.diagnostics.some((diagnostic) => diagnostic.code.startsWith("assertion_coverage_"))
    ).toBe(false);

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("action: assertVisible");
  });

  it("balanced applies more assertions than reliable for the same candidate set", async () => {
    const yamlBase = [
      "name: sample",
      "steps:",
      "  - action: navigate",
      "    url: https://example.com",
      "  - action: click",
      "    target:",
      '      value: "#submit"',
      "      kind: css",
      "      source: manual",
    ].join("\n");

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: {
            value: "getByRole('heading', { name: 'Saved' })",
            kind: "locatorExpression",
            source: "manual",
          },
          text: "Saved",
        },
        confidence: 0.9,
        rationale: "snapshot text candidate",
        candidateSource: "snapshot_native",
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.89,
        rationale: "snapshot visible candidate",
        candidateSource: "snapshot_native",
      },
    ]);

    const reliableDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-policy-reliable-"));
    const balancedDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-policy-balanced-"));
    tempDirs.push(reliableDir, balancedDir);
    const reliableYaml = path.join(reliableDir, "sample.yaml");
    const balancedYaml = path.join(balancedDir, "sample.yaml");
    await fs.writeFile(reliableYaml, yamlBase, "utf-8");
    await fs.writeFile(balancedYaml, yamlBase, "utf-8");

    const reliableResult = await improveTestFile({
      testFile: reliableYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    const balancedResult = await improveTestFile({
      testFile: balancedYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "balanced",
    });

    expect(reliableResult.report.summary.appliedAssertions).toBe(1);
    expect(balancedResult.report.summary.appliedAssertions).toBeGreaterThan(
      reliableResult.report.summary.appliedAssertions
    );
  });

  it("balanced does not increase skipped_runtime_failure in a passing baseline scenario", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-policy-failure-baseline-"));
    tempDirs.push(dir);
    const reliableYaml = path.join(dir, "reliable.yaml");
    const balancedYaml = path.join(dir, "balanced.yaml");

    const yamlBase = [
      "name: sample",
      "steps:",
      "  - action: navigate",
      "    url: https://example.com",
      "  - action: click",
      "    target:",
      '      value: "#submit"',
      "      kind: css",
      "      source: manual",
    ].join("\n");
    await fs.writeFile(reliableYaml, yamlBase, "utf-8");
    await fs.writeFile(balancedYaml, yamlBase, "utf-8");

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
        confidence: 0.95,
        rationale: "deterministic value",
        candidateSource: "deterministic",
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#status", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.9,
        rationale: "deterministic text",
        candidateSource: "deterministic",
      },
    ]);

    const reliableResult = await improveTestFile({
      testFile: reliableYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });
    const balancedResult = await improveTestFile({
      testFile: balancedYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "balanced",
    });

    const reliableRuntimeFailures = reliableResult.report.assertionCandidates.filter(
      (candidate) => candidate.applyStatus === "skipped_runtime_failure"
    ).length;
    const balancedRuntimeFailures = balancedResult.report.assertionCandidates.filter(
      (candidate) => candidate.applyStatus === "skipped_runtime_failure"
    ).length;
    expect(reliableRuntimeFailures).toBe(0);
    expect(balancedRuntimeFailures).toBe(0);
  });

  it("balanced allows runtime-validated snapshot assertVisible while reliable skips it", async () => {
    const yamlBase = [
      "name: sample",
      "steps:",
      "  - action: navigate",
      "    url: https://example.com",
      "  - action: click",
      "    target:",
      '      value: "#submit"',
      "      kind: css",
      "      source: manual",
    ].join("\n");

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.95,
        rationale: "snapshot visible candidate",
        candidateSource: "snapshot_native",
      },
    ]);

    const reliableDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-visible-reliable-"));
    const balancedDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-visible-balanced-"));
    tempDirs.push(reliableDir, balancedDir);
    const reliableYaml = path.join(reliableDir, "sample.yaml");
    const balancedYaml = path.join(balancedDir, "sample.yaml");
    await fs.writeFile(reliableYaml, yamlBase, "utf-8");
    await fs.writeFile(balancedYaml, yamlBase, "utf-8");

    const reliableResult = await improveTestFile({
      testFile: reliableYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });
    const balancedResult = await improveTestFile({
      testFile: balancedYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "balanced",
    });

    expect(reliableResult.report.assertionCandidates[0]?.applyStatus).toBe("skipped_policy");
    expect(balancedResult.report.assertionCandidates[0]?.applyStatus).toBe("applied");
  });

  it("respects per-profile apply caps (reliable=1, balanced=2, aggressive=3)", async () => {
    const yamlBase = [
      "name: sample",
      "steps:",
      "  - action: navigate",
      "    url: https://example.com",
      "  - action: click",
      "    target:",
      '      value: "#submit"',
      "      kind: css",
      "      source: manual",
    ].join("\n");

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertValue",
          target: { value: "#name", kind: "css", source: "manual" },
          value: "Alice",
        },
        confidence: 0.95,
        rationale: "value",
        candidateSource: "deterministic",
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertText",
          target: { value: "#status", kind: "css", source: "manual" },
          text: "Saved",
        },
        confidence: 0.94,
        rationale: "text",
        candidateSource: "deterministic",
      },
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#toast", kind: "css", source: "manual" },
        },
        confidence: 0.93,
        rationale: "visible",
        candidateSource: "deterministic",
      },
    ]);

    const reliableDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cap-reliable-"));
    const balancedDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cap-balanced-"));
    const aggressiveDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-cap-aggressive-"));
    tempDirs.push(reliableDir, balancedDir, aggressiveDir);
    const reliableYaml = path.join(reliableDir, "sample.yaml");
    const balancedYaml = path.join(balancedDir, "sample.yaml");
    const aggressiveYaml = path.join(aggressiveDir, "sample.yaml");
    await fs.writeFile(reliableYaml, yamlBase, "utf-8");
    await fs.writeFile(balancedYaml, yamlBase, "utf-8");
    await fs.writeFile(aggressiveYaml, yamlBase, "utf-8");

    const reliableResult = await improveTestFile({
      testFile: reliableYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });
    const balancedResult = await improveTestFile({
      testFile: balancedYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "balanced",
    });
    const aggressiveResult = await improveTestFile({
      testFile: aggressiveYaml,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "aggressive",
    });

    expect(reliableResult.report.summary.appliedAssertions).toBe(1);
    expect(balancedResult.report.summary.appliedAssertions).toBe(2);
    expect(aggressiveResult.report.summary.appliedAssertions).toBe(3);
  });

  it("keeps snapshot assertVisible candidates report-only in reliable apply mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-policy-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    buildAssertionCandidatesMock.mockReturnValue([
      {
        index: 1,
        afterAction: "click",
        candidate: {
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.99,
        rationale: "snapshot visible candidate",
        candidateSource: "snapshot_native",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "candidates",
      assertionPolicy: "reliable",
    });

    expect(result.report.summary.assertionApplyPolicy).toBe("reliable");
    expect(result.report.summary.assertionCandidates).toBe(1);
    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_policy");
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "assertion_apply_runtime_failure"
      )
    ).toBe(false);
  });

});
