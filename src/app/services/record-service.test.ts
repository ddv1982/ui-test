import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

vi.mock("../../utils/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../utils/chromium-runtime.js", () => ({
  ensureChromiumAvailable: vi.fn(),
}));

vi.mock("../../core/recorder.js", () => ({
  record: vi.fn(),
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

import { loadConfig } from "../../utils/config.js";
import { ensureChromiumAvailable } from "../../utils/chromium-runtime.js";
import { record } from "../../core/recorder.js";
import { runRecord } from "./record-service.js";

describe("runRecord browser preflight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      testDir: "e2e",
      baseUrl: "http://127.0.0.1:5173",
    });
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
  });

  it("fails fast with remediation when chromium is unavailable", async () => {
    vi.mocked(ensureChromiumAvailable).mockRejectedValue(
      new UserError(
        "Chromium browser is not installed.",
        "Run: ui-test setup quickstart or npx playwright install chromium"
      )
    );

    const run = runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      browser: "chromium",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup quickstart"),
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("does not preflight chromium when non-chromium browser is selected", async () => {
    await runRecord({
      name: "sample",
      url: "http://127.0.0.1:5173",
      description: "demo",
      browser: "firefox",
    });

    expect(ensureChromiumAvailable).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
  });
});
