import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserError } from "../utils/errors.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import {
  normalizeFirstNavigate,
  record,
  resolvePlaywrightCliPath,
  runCodegen,
} from "./recorder.js";

function createMockChildProcess() {
  return new EventEmitter() as ChildProcess;
}

describe("runCodegen", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("resolves when Playwright codegen exits with code 0", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const run = runCodegen("npx", {
      url: "http://127.0.0.1:5173",
      outputFile: "/tmp/out.spec.ts",
      browser: "chromium",
    });
    child.emit("close", 0, null);

    await expect(run).resolves.toBeUndefined();
  });

  it("rejects when Playwright codegen exits with non-zero code", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const run = runCodegen("npx", {
      url: "http://127.0.0.1:5173",
      outputFile: "/tmp/out.spec.ts",
      browser: "chromium",
    });
    child.emit("close", 1, null);

    await expect(run).rejects.toThrow("Playwright codegen exited with code 1");
  });
});

describe("resolvePlaywrightCliPath", () => {
  it("converts file URLs with fileURLToPath semantics", () => {
    const fileUrl = pathToFileURL(path.join(os.tmpdir(), "playwright-cli.js")).href;
    expect(resolvePlaywrightCliPath(fileUrl)).toBe(fileURLToPath(fileUrl));
  });

  it("returns non-file paths unchanged", () => {
    expect(resolvePlaywrightCliPath("npx")).toBe("npx");
  });
});

describe("record", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("records and saves steps from playwright-test codegen output", async () => {
    vi.spyOn(Date, "now").mockReturnValue(424242);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const tmpCodePath = path.join(os.tmpdir(), "ui-test-recording-424242.spec.ts");
    await fs.writeFile(
      tmpCodePath,
      [
        "import { test } from '@playwright/test';",
        "test('x', async ({ page }) => {",
        "  await page.goto('https://example.com');",
        "  await page.getByRole('button', { name: 'Save' }).click();",
        "});",
      ].join("\n"),
      "utf-8"
    );

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Codegen Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    child.emit("close", 0, null);

    const result = await run;
    const saved = await fs.readFile(result.outputPath, "utf-8");

    expect(result.recordingMode).toBe("codegen");
    expect(result.stepCount).toBeGreaterThan(0);
    expect(saved).toContain("name: Codegen Recording");
    expect(saved).toContain("action: click");

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("recovers steps even when codegen exits via signal", async () => {
    vi.spyOn(Date, "now").mockReturnValue(515151);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const tmpCodePath = path.join(os.tmpdir(), "ui-test-recording-515151.spec.ts");
    await fs.writeFile(
      tmpCodePath,
      [
        "import { test } from '@playwright/test';",
        "test('x', async ({ page }) => {",
        "  await page.goto('https://example.com');",
        "  await page.getByRole('button', { name: 'Save' }).click();",
        "});",
      ].join("\n"),
      "utf-8"
    );

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Recovered Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    child.emit("close", null, "SIGTERM");

    const result = await run;
    expect(result.recordingMode).toBe("codegen");
    expect(result.stepCount).toBeGreaterThan(0);

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("throws UserError when codegen produces no steps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(535353);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValueOnce(child);

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Empty Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    child.emit("close", 0, null);

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("No interactions were recorded");
    expect(spawn).toHaveBeenCalledTimes(1);

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("throws UserError with codegen failure reason when codegen fails and no steps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(616161);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValueOnce(child);

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Failed Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    child.emit("close", 1, null);

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("No interactions were recorded");

    await fs.rm(outputDir, { recursive: true, force: true });
  });
});

describe("normalizeFirstNavigate", () => {
  it("replaces cross-origin redirect with starting URL path", () => {
    const steps = normalizeFirstNavigate(
      [
        { action: "navigate", url: "https://consent.example.com/auth?key=abc" },
        { action: "click", target: { value: "getByRole('button', { name: 'OK' })", kind: "locatorExpression" as const, source: "codegen" as const } },
      ],
      "https://example.com"
    );

    expect(steps[0]).toEqual({ action: "navigate", url: "/" });
    expect(steps[1]).toMatchObject({ action: "click" });
  });

  it("normalizes first navigate to relative path when it already matches", () => {
    const steps = normalizeFirstNavigate(
      [{ action: "navigate", url: "https://example.com/dashboard" }],
      "https://example.com/dashboard"
    );

    expect(steps[0]).toEqual({ action: "navigate", url: "/dashboard" });
  });

  it("preserves path from starting URL", () => {
    const steps = normalizeFirstNavigate(
      [{ action: "navigate", url: "https://redirect.example.com/consent" }],
      "https://example.com/login?next=/home"
    );

    expect(steps[0]).toEqual({ action: "navigate", url: "/login?next=/home" });
  });

  it("injects navigate when first step is not a navigate", () => {
    const steps = normalizeFirstNavigate(
      [{ action: "click", target: { value: "#btn", kind: "css" as const, source: "codegen" as const } }],
      "https://example.com/page"
    );

    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ action: "navigate", url: "/page" });
    expect(steps[1]).toMatchObject({ action: "click" });
  });

  it("returns steps unchanged for invalid starting URL", () => {
    const original = [{ action: "navigate" as const, url: "https://example.com" }];
    const steps = normalizeFirstNavigate(original, "not-a-url");

    expect(steps).toEqual(original);
  });

  it("returns empty steps unchanged", () => {
    expect(normalizeFirstNavigate([], "https://example.com")).toEqual([]);
  });

  it("preserves hash from starting URL", () => {
    const steps = normalizeFirstNavigate(
      [{ action: "navigate", url: "https://redirect.example.com/consent" }],
      "https://example.com/page#section"
    );

    expect(steps[0]).toEqual({ action: "navigate", url: "/page#section" });
  });
});
