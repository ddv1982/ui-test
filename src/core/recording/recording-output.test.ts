import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRecordedYamlPath,
  deriveBaseUrl,
  normalizeRecordedSteps,
  saveRecordedYaml,
} from "./recording-output.js";

describe("recording-output", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("normalizes steps through the shared recording pipeline", () => {
    const steps = normalizeRecordedSteps(
      [
        {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Save' })",
            kind: "locatorExpression",
            source: "codegen",
          },
        },
      ],
      "https://example.com/dashboard?tab=settings"
    );

    expect(steps[0]).toEqual({ action: "navigate", url: "/dashboard?tab=settings" });
    expect(steps[1]).toMatchObject({ action: "click" });
  });

  it("writes YAML with derived baseUrl and normalized navigation", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recording-output-"));
    tempDirs.push(dir);

    const result = await saveRecordedYaml({
      name: "Settings Save",
      description: "shared pipeline",
      outputDir: dir,
      steps: [
        {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Save' })",
            kind: "locatorExpression",
            source: "codegen",
          },
        },
      ],
      startingUrl: "https://example.com/dashboard?tab=settings",
      now: () => 123,
    });

    expect(result.outputPath).toBe(path.join(dir, "settings-save.yaml"));
    expect(result.steps).toHaveLength(2);

    const saved = await fs.readFile(result.outputPath, "utf-8");
    expect(saved).toContain("name: Settings Save");
    expect(saved).toContain("description: shared pipeline");
    expect(saved).toContain("baseUrl: https://example.com");
    expect(saved).toContain("url: /dashboard?tab=settings");
  });

  it("provides stable path/baseUrl helpers", () => {
    expect(defaultRecordedYamlPath("e2e", "Login Flow", () => 123)).toBe("e2e/login-flow.yaml");
    expect(deriveBaseUrl("https://example.com/path?q=1")).toBe("https://example.com");
    expect(deriveBaseUrl("not-a-url")).toBeUndefined();
  });
});
