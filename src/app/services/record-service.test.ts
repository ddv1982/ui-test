import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock("../../utils/chromium-runtime.js", () => ({
  ensureChromiumAvailable: vi.fn(),
}));

vi.mock("../../core/recorder.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/recorder.js")>();
  return {
    ...actual,
    record: vi.fn(),
  };
});

vi.mock("../../core/improve/improve.js", () => ({
  improveTestFile: vi.fn(),
}));

vi.mock("../../utils/ui.js", () => ({
  ui: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    dim: vi.fn(),
    heading: vi.fn(),
  },
}));

import fs from "node:fs/promises";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { record } from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { ui } from "../../utils/ui.js";
import { runRecord } from "./record-service.js";

function mockRecordDefaults() {
  vi.mocked(record).mockResolvedValue({
    outputPath: "e2e/sample.yaml",
    stepCount: 2,
    recordingMode: "codegen",
  });
  vi.mocked(improveTestFile).mockResolvedValue({
    report: {
      testFile: "e2e/sample.yaml",
      generatedAt: new Date().toISOString(),
      providerUsed: "playwright",
      summary: {
        unchanged: 1,
        improved: 0,
        fallback: 0,
        warnings: 0,
        assertionCandidates: 0,
        appliedAssertions: 0,
        skippedAssertions: 0,
      },
      stepFindings: [],
      assertionCandidates: [],
      diagnostics: [],
    },
    reportPath: "e2e/sample.improve-report.json",
  });
}

describe("runRecord browser preflight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRecordDefaults();
  });

  it("fails fast with remediation when chromium is unavailable", async () => {
    vi.mocked(ensureChromiumAvailable).mockRejectedValue(
      new UserError(
        "Chromium browser is not installed.",
        "Run: ui-test setup or npx playwright install chromium"
      )
    );

    const run = runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "chromium",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup"),
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("does not preflight chromium when non-chromium browser is selected", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(ensureChromiumAvailable).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("runRecord auto-improve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRecordDefaults();
  });

  it("calls auto-improve by default after recording", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(improveTestFile).toHaveBeenCalledWith({
      testFile: "e2e/sample.yaml",
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });
    expect(ui.info).toHaveBeenCalledWith("Auto-improve: no changes needed");
  });

  it("skips auto-improve when improve is false", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improve: false,
    });

    expect(improveTestFile).not.toHaveBeenCalled();
  });

  it("prints summary when auto-improve makes changes", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        summary: {
          unchanged: 0,
          improved: 2,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 1,
          appliedAssertions: 1,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [
          {
            code: "runtime_failing_step_removed",
            level: "info",
            message: "Step 4: removed because it failed at runtime.",
          },
        ],
      },
      reportPath: "e2e/sample.improve-report.json",
    });

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(ui.success).toHaveBeenCalledWith(
      "Auto-improve: 2 selectors improved, 1 assertions applied, 1 transient steps removed"
    );
  });

  it("prefers canonical retained summary field in auto-improve output", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        summary: {
          unchanged: 0,
          improved: 1,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 0,
          skippedAssertions: 0,
          runtimeFailingStepsRetained: 2,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
      reportPath: "e2e/sample.improve-report.json",
    });

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(ui.success).toHaveBeenCalledWith(
      "Auto-improve: 1 selectors improved, 2 failing steps retained"
    );
  });

  it("uses canonical retained diagnostics count when summary fields are absent", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        summary: {
          unchanged: 0,
          improved: 1,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 0,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [
          {
            code: "runtime_failing_step_retained",
            level: "info",
            message: "Step 2 retained.",
          },
        ],
      },
      reportPath: "e2e/sample.improve-report.json",
    });

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(ui.success).toHaveBeenCalledWith(
      "Auto-improve: 1 selectors improved, 1 failing steps retained"
    );
  });

  it("warns gracefully when auto-improve fails", async () => {
    vi.mocked(improveTestFile).mockRejectedValue(new Error("browser crashed"));

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
    });

    expect(ui.warn).toHaveBeenCalledWith(
      expect.stringContaining("browser crashed")
    );
    expect(ui.warn).toHaveBeenCalledWith(
      expect.stringContaining("You can run it manually")
    );
  });
});

describe("runRecordFromFile", () => {
  const validRecording = JSON.stringify({
    title: "Login Flow",
    steps: [
      { type: "navigate", url: "https://example.com/login" },
      { type: "click", selectors: [["aria/Submit[role=\"button\"]"]] },
    ],
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.readFile).mockResolvedValue(validRecording);
    vi.mocked(fs.writeFile).mockResolvedValue();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/login-flow.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 0,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
      reportPath: "e2e/login-flow.improve-report.json",
    });
  });

  it("imports a valid DevTools recording JSON file", async () => {
    await runRecord({ fromFile: "/tmp/recording.json" });

    expect(fs.readFile).toHaveBeenCalledWith("/tmp/recording.json", "utf-8");
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("login-flow.yaml"),
      expect.stringContaining("name: Login Flow"),
      "utf-8"
    );
    expect(ui.success).toHaveBeenCalledWith(
      expect.stringContaining("Test saved to")
    );
  });

  it("throws UserError when file does not exist", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    await expect(
      runRecord({ fromFile: "/tmp/missing.json" })
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      runRecord({ fromFile: "/tmp/missing.json" })
    ).rejects.toThrow("Could not read file");
  });

  it("throws UserError when file contains no supported steps", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ title: "Empty", steps: [{ type: "scroll" }] })
    );

    await expect(
      runRecord({ fromFile: "/tmp/empty.json" })
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      runRecord({ fromFile: "/tmp/empty.json" })
    ).rejects.toThrow("No supported interactions");
  });

  it("uses recording title as test name, falling back to filename", async () => {
    await runRecord({ fromFile: "/tmp/recording.json" });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("login-flow.yaml"),
      expect.stringContaining("name: Login Flow"),
      "utf-8"
    );

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        steps: [{ type: "navigate", url: "https://example.com" }],
      })
    );
    await runRecord({ fromFile: "/tmp/my-test.json" });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("my-test.yaml"),
      expect.stringContaining("name: my-test"),
      "utf-8"
    );
  });

  it("skips auto-improve when improve is false", async () => {
    await runRecord({ fromFile: "/tmp/recording.json", improve: false });

    expect(improveTestFile).not.toHaveBeenCalled();
  });
});
