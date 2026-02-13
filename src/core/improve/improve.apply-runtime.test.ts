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

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({ url: () => "about:blank" })),
      close: vi.fn(async () => {}),
    })),
  },
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
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

vi.mock("./llm/selector-ranker.js", () => ({
  rankSelectorCandidates: vi.fn(async (scored) => ({
    selected: scored[1],
    llmUsed: false,
    diagnostics: [],
  })),
}));

vi.mock("./assertion-candidates.js", () => ({
  buildAssertionCandidates: buildAssertionCandidatesMock,
}));

vi.mock("./providers/provider-selector.js", () => ({
  selectImproveProvider: vi.fn(async () => ({
    providerUsed: "playwright",
    diagnostics: [],
  })),
}));

import { improveTestFile } from "./improve.js";

describe("improve apply runtime replay", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
    executeRuntimeStepMock.mockImplementation(async () => {});
    buildAssertionCandidatesMock.mockClear();
    buildAssertionCandidatesMock.mockReturnValue([]);
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
      apply: true,
      applyAssertions: false,
      provider: "playwright",
      assertions: "none",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
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

  it("applies high-confidence assertion candidates with --apply-assertions", async () => {
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
        confidence: 0.9,
        rationale: "high confidence click postcondition",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(result.report.summary.appliedAssertions).toBe(1);
    expect(result.report.summary.skippedAssertions).toBe(0);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("applied");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("action: assertVisible");
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
          action: "assertVisible",
          target: { value: "#status", kind: "css", source: "manual" },
        },
        confidence: 0.9,
        rationale: "stable state check",
      },
    ]);

    const result = await improveTestFile({
      testFile: yamlPath,
      apply: true,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(result.report.summary.improved).toBeGreaterThan(0);
    expect(result.report.summary.appliedAssertions).toBe(1);

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("getByRole('button', { name: 'Save' })");
    expect(saved).toContain("action: assertVisible");
  });

  it("skips low-confidence assertions when apply is requested", async () => {
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
      apply: false,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_low_confidence");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).not.toContain("action: assertVisible");
  });

  it("skips runtime-failing assertion candidates and emits warning diagnostics", async () => {
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
        confidence: 0.9,
        rationale: "should be visible after click",
      },
    ]);
    executeRuntimeStepMock.mockImplementation(async (_page, step) => {
      if ((step as { action: string }).action === "assertVisible") {
        throw new Error("Expected element to be visible");
      }
    });

    const result = await improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.report.summary.appliedAssertions).toBe(0);
    expect(result.report.summary.skippedAssertions).toBe(1);
    expect(result.report.summary.warnings).toBeGreaterThan(0);
    expect(result.report.assertionCandidates[0]?.applyStatus).toBe("skipped_runtime_failure");
    expect(
      result.report.diagnostics.some((diagnostic) => diagnostic.code === "assertion_apply_runtime_failure")
    ).toBe(true);
  });

  it("does not insert duplicate adjacent assertions on repeated apply runs", async () => {
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
        confidence: 0.9,
        rationale: "stable visible state",
      },
    ]);

    await improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    const second = await improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: true,
      provider: "playwright",
      assertions: "candidates",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(second.report.summary.appliedAssertions).toBe(0);
    expect(second.report.summary.skippedAssertions).toBe(1);
    expect(second.report.assertionCandidates[0]?.applyStatus).toBe("skipped_existing");

    const saved = await fs.readFile(yamlPath, "utf-8");
    const matchCount = saved.match(/action: assertVisible/g)?.length ?? 0;
    expect(matchCount).toBe(1);
  });
});
