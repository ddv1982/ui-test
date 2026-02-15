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
const { collectPlaywrightCliStepSnapshotsMock } = vi.hoisted(() => ({
  collectPlaywrightCliStepSnapshotsMock: vi.fn(async () => ({
    available: false,
    stepSnapshots: [],
    diagnostics: [],
  })),
}));
const { waitForPostStepNetworkIdleMock } = vi.hoisted(() => ({
  waitForPostStepNetworkIdleMock: vi.fn(async () => false),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
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

vi.mock("./providers/playwright-cli-replay.js", () => ({
  collectPlaywrightCliStepSnapshots: collectPlaywrightCliStepSnapshotsMock,
}));

import { improveTestFile } from "./improve.js";

describe("improve apply runtime replay", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    executeRuntimeStepMock.mockImplementation(async () => {});
    buildAssertionCandidatesMock.mockClear();
    buildAssertionCandidatesMock.mockReturnValue([]);
    collectPlaywrightCliStepSnapshotsMock.mockClear();
    collectPlaywrightCliStepSnapshotsMock.mockResolvedValue({
      available: false,
      stepSnapshots: [],
      diagnostics: [],
    });
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
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("applied");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("action: assertValue");
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
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_low_confidence");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).not.toContain("action: assertVisible");
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

  it("adds snapshot-cli assertion candidates when assertion source is snapshot-cli", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-snapshot-cli-"));
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

    collectPlaywrightCliStepSnapshotsMock.mockResolvedValueOnce({
      available: true,
      stepSnapshots: [
        {
          index: 1,
          step: {
            action: "click",
            target: { value: "#submit", kind: "css", source: "manual" },
          },
          preSnapshot: `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n`,
          postSnapshot:
            `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n  - heading "Welcome" [level=1] [ref=e3]\n`,
        },
      ],
      diagnostics: [],
    });

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "snapshot-cli",
    });

    expect(collectPlaywrightCliStepSnapshotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 15_000,
      })
    );
    expect(result.report.summary.assertionCandidates).toBe(1);
    expect(result.report.assertionCandidates[0]?.candidateSource).toBe("snapshot_cli");
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
      newPage: vi.fn(async () => ({
        url: () => "about:blank",
        goto: vi.fn(async () => {}),
        waitForLoadState: vi.fn(async () => {}),
        locator: vi.fn(() => ({
          ariaSnapshot: ariaSnapshotMock,
        })),
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

  it("falls back to deterministic candidates when snapshot-cli source is unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-snapshot-cli-"));
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
    buildAssertionCandidatesMock.mockReturnValueOnce([
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
        candidateSource: "deterministic",
      },
    ]);
    collectPlaywrightCliStepSnapshotsMock.mockResolvedValueOnce({
      available: false,
      stepSnapshots: [],
      diagnostics: [
        {
          code: "assertion_source_snapshot_cli_unavailable",
          level: "warn",
          message: "unavailable",
        },
      ],
    });

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "snapshot-cli",
    });

    expect(result.report.summary.assertionCandidates).toBe(1);
    expect(result.report.assertionCandidates[0]?.candidateSource).toBe("deterministic");
    expect(
      result.report.diagnostics.some(
        (diagnostic) => diagnostic.code === "assertion_source_snapshot_cli_fallback"
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
    });

    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.assertionCandidates).toHaveLength(1);
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

  it("keeps snapshot assertVisible candidates report-only in apply mode", async () => {
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
