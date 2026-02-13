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
  detectJsonlCapability,
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
      outputFile: "/tmp/out.jsonl",
      target: "jsonl",
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
      outputFile: "/tmp/out.jsonl",
      target: "jsonl",
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
    delete process.env.UI_TEST_DISABLE_JSONL;
  });

  it("recovers and saves JSONL steps even when jsonl codegen exits via signal", async () => {
    vi.spyOn(Date, "now").mockReturnValue(424242);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const tmpJsonlPath = path.join(os.tmpdir(), "ui-test-recording-424242.jsonl");
    await fs.writeFile(tmpJsonlPath, '{"type":"click","selector":"button"}\n', "utf-8");

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
    const saved = await fs.readFile(result.outputPath, "utf-8");

    expect(result.recordingMode).toBe("jsonl");
    expect(saved).toContain("name: Recovered Recording");
    expect(saved).toContain("target:");

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("falls back to playwright-test parsing when JSONL is unavailable", async () => {
    vi.spyOn(Date, "now").mockReturnValue(515151);

    const jsonlChild = createMockChildProcess();
    const fallbackChild = createMockChildProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(jsonlChild)
      .mockReturnValueOnce(fallbackChild);

    const fallbackCodePath = path.join(
      os.tmpdir(),
      "ui-test-recording-fallback-515151.spec.ts"
    );
    await fs.writeFile(
      fallbackCodePath,
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
      name: "Fallback Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    jsonlChild.emit("close", 1, null);

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(2);
    });
    fallbackChild.emit("close", 0, null);

    const result = await run;
    const saved = await fs.readFile(result.outputPath, "utf-8");

    expect(result.recordingMode).toBe("fallback");
    expect(result.degraded).toBe(true);
    expect(saved).toContain("action: click");

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("fails immediately when JSONL succeeds but yields no actionable steps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(535353);

    const jsonlChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValueOnce(jsonlChild);

    const tmpJsonlPath = path.join(os.tmpdir(), "ui-test-recording-535353.jsonl");
    await fs.writeFile(tmpJsonlPath, '{"type":"openPage","url":"about:blank"}\n', "utf-8");

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "No Interaction Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    jsonlChild.emit("close", 0, null);

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("No interactions were recorded");
    expect(spawn).toHaveBeenCalledTimes(1);

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("throws clear error when both JSONL and fallback produce no steps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(616161);

    const jsonlChild = createMockChildProcess();
    const fallbackChild = createMockChildProcess();
    vi.mocked(spawn)
      .mockReturnValueOnce(jsonlChild)
      .mockReturnValueOnce(fallbackChild);

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Broken Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    jsonlChild.emit("close", 1, null);

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(2);
    });
    fallbackChild.emit("close", 1, null);

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("No interactions were recorded");

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("uses fallback directly when JSONL is disabled by environment", async () => {
    vi.spyOn(Date, "now").mockReturnValue(717171);
    process.env.UI_TEST_DISABLE_JSONL = "1";

    const fallbackChild = createMockChildProcess();
    vi.mocked(spawn).mockReturnValueOnce(fallbackChild);

    const fallbackCodePath = path.join(
      os.tmpdir(),
      "ui-test-recording-fallback-717171.spec.ts"
    );
    await fs.writeFile(
      fallbackCodePath,
      [
        "import { test } from '@playwright/test';",
        "test('x', async ({ page }) => {",
        "  await page.getByRole('button', { name: 'Save' }).click();",
        "});",
      ].join("\n"),
      "utf-8"
    );

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "JSONL Disabled Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    fallbackChild.emit("close", 0, null);

    const result = await run;
    expect(result.recordingMode).toBe("fallback");
    expect(spawn).toHaveBeenCalledTimes(1);

    await fs.rm(outputDir, { recursive: true, force: true });
  });
});

describe("detectJsonlCapability", () => {
  it("returns unknown for npx entrypoint", async () => {
    await expect(detectJsonlCapability("npx")).resolves.toBe("unknown");
  });

  it("detects supported when playwright-core jsonl generator exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-capability-"));
    const cliPath = path.join(root, "node_modules", "playwright", "cli.js");
    const jsonlPath = path.join(
      root,
      "node_modules",
      "playwright-core",
      "lib",
      "server",
      "codegen",
      "jsonl.js"
    );
    await fs.mkdir(path.dirname(cliPath), { recursive: true });
    await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
    await fs.writeFile(cliPath, "", "utf-8");
    await fs.writeFile(jsonlPath, "", "utf-8");

    await expect(detectJsonlCapability(cliPath)).resolves.toBe("supported");

    await fs.rm(root, { recursive: true, force: true });
  });

  it("detects unsupported when jsonl generator is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-capability-"));
    const cliPath = path.join(root, "node_modules", "playwright", "cli.js");
    await fs.mkdir(path.dirname(cliPath), { recursive: true });
    await fs.writeFile(cliPath, "", "utf-8");

    await expect(detectJsonlCapability(cliPath)).resolves.toBe("unsupported");

    await fs.rm(root, { recursive: true, force: true });
  });
});
