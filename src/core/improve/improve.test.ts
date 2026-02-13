import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockRejectedValue(new Error("no browser in unit tests")),
  },
}));

import { improveTestFile } from "./improve.js";

describe("improveTestFile", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("produces a report without mutating the YAML by default", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    const reportPath = path.join(dir, "report.json");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: false,
      provider: "playwright",
      assertions: "none",
      llmEnabled: false,
      reportPath,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.outputPath).toBeUndefined();
    expect(result.report.stepFindings).toHaveLength(1);
    expect(result.report.summary.improved + result.report.summary.unchanged).toBe(1);
    const reportContent = await fs.readFile(reportPath, "utf-8");
    expect(reportContent).toContain('"testFile"');
  });

  it("fails fast in apply mode when runtime validation is unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );

    const run = improveTestFile({
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

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Cannot apply improve changes without runtime validation");
  });

  it("fails fast in apply-assertions mode when runtime validation is unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );

    const run = improveTestFile({
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

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Cannot apply improve changes without runtime validation");
  });

  it("rejects apply-assertions when assertions mode is none", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );

    const run = improveTestFile({
      testFile: yamlPath,
      apply: false,
      applyAssertions: true,
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

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(
      "Cannot apply assertion candidates when assertions mode is disabled"
    );
  });
});
