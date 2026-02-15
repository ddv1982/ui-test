import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

const { chromiumLaunchMock, runImproveSelectorPassMock, runImproveAssertionPassMock } = vi.hoisted(
  () => ({
    chromiumLaunchMock: vi.fn(),
    runImproveSelectorPassMock: vi.fn(),
    runImproveAssertionPassMock: vi.fn(),
  })
);

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}));

vi.mock("./improve-selector-pass.js", () => ({
  runImproveSelectorPass: runImproveSelectorPassMock,
}));

vi.mock("./improve-assertion-pass.js", () => ({
  runImproveAssertionPass: runImproveAssertionPassMock,
}));

import { improveTestFile } from "./improve.js";

function createBrowserMock() {
  return {
    newPage: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
  };
}

describe("improveTestFile runner", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetAllMocks();

    chromiumLaunchMock.mockResolvedValue(createBrowserMock());
    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
    }));
    runImproveAssertionPassMock.mockImplementation(async (input) => ({
      outputSteps: input.outputSteps,
      assertionCandidates: [],
      appliedAssertions: 0,
      skippedAssertions: 0,
    }));
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function writeSampleYaml(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );
    return yamlPath;
  }

  it("fails in review mode when chromium is unavailable", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
  });

  it("fails in apply mode with explicit remediation hint", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup quickstart"),
    });
  });

  it("writes default report with playwright provider", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.reportPath).toBe(path.join(path.dirname(yamlPath), "sample.improve-report.json"));
    expect(result.report.providerUsed).toBe("playwright");
    expect(result.outputPath).toBeUndefined();

    const savedReport = JSON.parse(await fs.readFile(result.reportPath, "utf-8")) as {
      providerUsed: string;
    };
    expect(savedReport.providerUsed).toBe("playwright");
  });

  it("downgrades applyAssertions when assertions mode is none", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "none",
    });

    expect(runImproveAssertionPassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyAssertions: false,
        assertions: "none",
      })
    );
    expect(
      result.report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "apply_assertions_disabled_by_assertions_none" &&
          diagnostic.level === "warn"
      )
    ).toBe(true);
  });
});
