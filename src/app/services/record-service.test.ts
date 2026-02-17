import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("../../utils/chromium-runtime.js", () => ({
  ensureChromiumAvailable: vi.fn(),
}));

vi.mock("../../core/recorder.js", () => ({
  record: vi.fn(),
}));

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

import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { record } from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import { ui } from "../../utils/ui.js";
import { runRecord } from "./record-service.js";

function mockRecordDefaults() {
  vi.mocked(record).mockResolvedValue({
    outputPath: "e2e/sample.yaml",
    stats: {
      selectorSteps: 1,
      stableSelectors: 1,
      fallbackSelectors: 0,
      frameAwareSelectors: 0,
    },
    recordingMode: "jsonl",
    degraded: false,
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
