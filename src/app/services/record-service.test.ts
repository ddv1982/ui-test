import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import type * as FsPromises from "node:fs/promises";
import { UserError } from "../../utils/errors.js";

type FsPromisesModule = typeof FsPromises & {
  default: typeof FsPromises;
};

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as FsPromisesModule;
  return {
    ...actual,
    default: {
      ...actual.default,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  };
});

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("../../utils/chromium-runtime.js", () => ({
  ensureChromiumAvailable: vi.fn(),
}));

vi.mock("./record-pick-locator.js", () => ({
  pickLocatorInteractively: vi.fn(),
}));

vi.mock("../../core/recorder.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
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
import { confirm, input } from "@inquirer/prompts";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { record, RECORDER_NO_INTERACTIONS_ERROR_CODE } from "../../core/recorder.js";
import { improveTestFile } from "../../core/improve/improve.js";
import type { ImproveReport } from "../../core/improve/report-schema.js";
import { ui } from "../../utils/ui.js";
import { pickLocatorInteractively } from "./record-pick-locator.js";
import { runRecord } from "./record-service.js";

const SAFE_DETERMINISM: ImproveReport["determinism"] = { status: "safe", reasons: [] };

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
      appliedBy: "report_only",
      determinism: SAFE_DETERMINISM,
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
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
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
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "reliable",
      appliedBy: "report_only",
    });
  });

  it("supports explicit auto-improve report mode", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "report",
    });

    expect(improveTestFile).toHaveBeenCalledWith({
      testFile: "e2e/sample.yaml",
      applySelectors: false,
      applyAssertions: false,
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "reliable",
      appliedBy: "report_only",
    });
    expect(ui.info).toHaveBeenCalledWith("Auto-improve report: no recommendations");
  });

  it("prints unsafe determinism verdict in auto-improve report mode", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: {
          status: "unsafe",
          reasons: ["missing_base_url"],
          suppressedMutationTypes: ["selector_update"],
        },
        summary: {
          unchanged: 1,
          improved: 0,
          fallback: 0,
          warnings: 1,
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

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "report",
    });

    expect(ui.warn).toHaveBeenCalledWith(
      "Auto-improve determinism: unsafe (missing baseUrl) — runtime selector apply blocked; recommendations kept report-only"
    );
  });

  it("supports explicit auto-improve apply mode", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "apply",
    });

    expect(improveTestFile).toHaveBeenCalledWith({
      testFile: "e2e/sample.yaml",
      outputPath: "e2e/sample.improved.yaml",
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
      assertionSource: "deterministic",
      assertionPolicy: "reliable",
      appliedBy: "auto_apply",
    });
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

  it("offers a manual locator fallback when codegen records no interactions", async () => {
    vi.mocked(record).mockRejectedValueOnce(
      new UserError("No interactions were recorded.", "iframe hint", RECORDER_NO_INTERACTIONS_ERROR_CODE)
    );
    vi.mocked(pickLocatorInteractively).mockRejectedValueOnce(new Error("pick cancelled"));
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(input)
      .mockResolvedValueOnce("getByRole('button', { name: 'Pay now' })")
      .mockResolvedValueOnce("iframe[title=\"Checkout\"], iframe[name=\"payment\"]")
      .mockResolvedValueOnce("click");

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173/checkout",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improve: false,
    });

    expect(confirm).toHaveBeenCalledWith({
      message: "Create a starter test from a pasted locator instead?",
      default: true,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("sample.yaml"),
      expect.stringContaining("framePath:"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("sample.yaml"),
      expect.stringContaining("- iframe[title=\"Checkout\"]"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("sample.yaml"),
      expect.stringContaining("- iframe[name=\"payment\"]"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("sample.yaml"),
      expect.stringContaining("value: \"getByRole('button', { name: 'Pay now' })\""),
      "utf-8"
    );
    expect(ui.success).toHaveBeenCalledWith(expect.stringContaining("Starter test saved to"));
  });

  it("creates a starter test from interactive Pick Locator when codegen records no interactions", async () => {
    vi.mocked(record).mockRejectedValueOnce(
      new UserError("No interactions were recorded.", "iframe hint", RECORDER_NO_INTERACTIONS_ERROR_CODE)
    );
    vi.mocked(pickLocatorInteractively).mockResolvedValueOnce(
      "frameLocator('iframe[title=\"Checkout\"]').getByRole('button', { name: 'Pay now' })"
    );
    vi.mocked(input).mockResolvedValueOnce("click");

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173/checkout",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      device: "Pixel 5",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
      improve: false,
    });

    expect(pickLocatorInteractively).toHaveBeenCalledWith({
      url: "http://127.0.0.1:5173/checkout",
      browser: "firefox",
      device: "Pixel 5",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("sample.yaml"),
      expect.stringContaining(
        "value: \"frameLocator('iframe[title=\\\"Checkout\\\"]').getByRole('button', { name: 'Pay now' })\""
      ),
      "utf-8"
    );
    expect(ui.info).toHaveBeenCalledWith("Interactive Pick Locator fallback created (2 steps)");
  });

  it("rethrows the original recorder error when manual fallback is declined", async () => {
    vi.mocked(record).mockRejectedValueOnce(
      new UserError("No interactions were recorded.", "iframe hint", RECORDER_NO_INTERACTIONS_ERROR_CODE)
    );
    vi.mocked(pickLocatorInteractively).mockRejectedValueOnce(new Error("pick cancelled"));
    vi.mocked(confirm).mockResolvedValueOnce(false);

    await expect(
      runRecord({
        name: "sample",
        url: "http://127.0.0.1:5173/checkout",
        description: "demo",
        outputDir: "e2e",
        browser: "firefox",
        improve: false,
      })
    ).rejects.toThrow("No interactions were recorded.");
  });

  it("skips auto-improve when improve mode is off", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "off",
    });

    expect(improveTestFile).not.toHaveBeenCalled();
  });

  it("prints summary when auto-improve makes changes", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "auto_apply",
        determinism: SAFE_DETERMINISM,
        summary: {
          unchanged: 0,
          improved: 2,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
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
      outputPath: "e2e/sample.improved.yaml",
    });

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "apply",
    });

    expect(ui.success).toHaveBeenCalledWith(
      "Auto-improve: 2 selectors improved, 1 assertions applied, 1 transient steps removed"
    );
  });

  it("prints safe determinism verdict in auto-improve apply mode", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "auto_apply",
        determinism: {
          status: "safe",
          reasons: [],
        },
        summary: {
          unchanged: 0,
          improved: 1,
          fallback: 0,
          warnings: 0,
          assertionCandidates: 0,
          appliedAssertions: 1,
          skippedAssertions: 0,
        },
        stepFindings: [],
        assertionCandidates: [],
        diagnostics: [],
      },
      reportPath: "e2e/sample.improve-report.json",
      outputPath: "e2e/sample.improved.yaml",
    });

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "apply",
    });

    expect(ui.info).toHaveBeenCalledWith(
      "Auto-improve determinism: safe — runtime-derived auto-apply allowed."
    );
  });

  it("prefers canonical retained summary field in auto-improve output", async () => {
    vi.mocked(improveTestFile).mockResolvedValue({
      report: {
        testFile: "e2e/sample.yaml",
        generatedAt: new Date().toISOString(),
        providerUsed: "playwright",
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
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
      improveMode: "apply",
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
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
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
      improveMode: "apply",
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
      "You can run it manually: ui-test improve " +
        path.resolve("e2e/sample.yaml") +
        " --assertions candidates --assertion-source deterministic --assertion-policy reliable --no-apply"
    );
  });

  it("preserves apply mode in the manual retry hint when auto-improve apply fails", async () => {
    vi.mocked(improveTestFile).mockRejectedValue(new Error("browser crashed"));

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "apply",
    });

    expect(ui.warn).toHaveBeenCalledWith(
      "You can run it manually: ui-test improve " +
        path.resolve("e2e/sample.yaml") +
        " --assertions candidates --assertion-source deterministic --assertion-policy reliable --plan && ui-test improve " +
        path.resolve("e2e/sample.yaml") +
        " --apply-plan " +
        path.resolve("e2e/sample.improve-plan.json")
    );
  });

  it("prints the same assertion profile in manual fallback guidance as auto-apply uses", async () => {
    vi.mocked(improveTestFile).mockRejectedValue(new Error("browser crashed"));

    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      outputDir: "e2e",
      browser: "firefox",
      improveMode: "report",
    });

    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        assertions: "candidates",
        assertionSource: "deterministic",
        assertionPolicy: "reliable",
      })
    );
    expect(ui.warn).toHaveBeenCalledWith(
      "You can run it manually: ui-test improve " +
        path.resolve("e2e/sample.yaml") +
        " --assertions candidates --assertion-source deterministic --assertion-policy reliable --no-apply"
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
        appliedBy: "report_only",
        determinism: SAFE_DETERMINISM,
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
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("baseUrl: https://example.com"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("url: /login"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("source: devtools-import"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("kind: locatorExpression"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("value: \"getByRole('button', { name: 'Submit' })\""),
      "utf-8"
    );
    expect(ui.success).toHaveBeenCalledWith(
      expect.stringContaining("Test saved to")
    );
  });

  it("imports first navigation as normalized path while preserving derived baseUrl", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        title: "Deep Link",
        steps: [
          { type: "navigate", url: "https://example.com/login?next=%2Fhome#cta" },
          { type: "click", selectors: [["#submit"]] },
        ],
      })
    );

    await runRecord({ fromFile: "/tmp/deep-link.json", improve: false });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("deep-link.yaml"),
      expect.stringContaining("baseUrl: https://example.com"),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("deep-link.yaml"),
      expect.stringContaining("url: /login?next=%2Fhome#cta"),
      "utf-8"
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

  it("runs from-file auto-improve in report mode by default", async () => {
    await runRecord({ fromFile: "/tmp/recording.json", improveMode: "report" });

    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: false,
        applyAssertions: false,
        assertionSource: "deterministic",
        appliedBy: "report_only",
      })
    );
  });

  it("runs from-file auto-improve in apply mode when requested", async () => {
    await runRecord({ fromFile: "/tmp/recording.json", improveMode: "apply" });

    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: true,
        applyAssertions: true,
        assertionSource: "deterministic",
        appliedBy: "auto_apply",
      })
    );
  });

  it("uses report mode by default for from-file auto-improve", async () => {
    await runRecord({ fromFile: "/tmp/recording.json" });

    expect(improveTestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        applySelectors: false,
        applyAssertions: false,
        assertionSource: "deterministic",
        appliedBy: "report_only",
      })
    );
  });
});
