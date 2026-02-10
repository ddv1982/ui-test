import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { play } from "./player.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_FIXTURE_DIR = join(__dirname, "../../tests/fixtures/html");
const YAML_FIXTURE_DIR = join(__dirname, "../../tests/fixtures/yaml");

let server: Server;
let baseUrl = "";
let tempDir = "";

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "easy-e2e-integration-"));

  await new Promise<void>((resolve, reject) => {
    server = createServer(async (req, res) => {
      try {
        const requestPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        const relativePath = requestPath.replace(/^\/+/, "");
        if (!relativePath) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const filePath = join(HTML_FIXTURE_DIR, relativePath);
        if (!filePath.startsWith(HTML_FIXTURE_DIR)) {
          res.writeHead(400);
          res.end("Invalid path");
          return;
        }

        const content = await readFile(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine integration test server address"));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await rm(tempDir, { recursive: true, force: true });
});

async function prepareFixtureYaml(fixtureName: string): Promise<string> {
  const fixturePath = join(YAML_FIXTURE_DIR, fixtureName);
  const content = await readFile(fixturePath, "utf-8");
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Unexpected fixture shape for ${fixtureName}`);
  }

  const fixture = parsed as Record<string, unknown>;
  if ("baseUrl" in fixture) {
    fixture.baseUrl = baseUrl;
  }

  const targetPath = join(tempDir, fixtureName);
  await writeFile(targetPath, yaml.dump(fixture), "utf-8");
  return targetPath;
}

async function writeInlineFixture(name: string, fixture: Record<string, unknown>): Promise<string> {
  const targetPath = join(tempDir, name);
  await writeFile(targetPath, yaml.dump(fixture), "utf-8");
  return targetPath;
}

describe("player integration tests", () => {
  it("should successfully play a valid test file", async () => {
    const testFile = await prepareFixtureYaml("valid-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
    expect(result.name).toBe("Valid Test");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].passed).toBe(true);
    expect(result.steps[1].passed).toBe(true);
  }, 30000);

  it("should fail on invalid YAML schema", async () => {
    const testFile = await prepareFixtureYaml("invalid-schema.yaml");

    await expect(play(testFile, { headed: false })).rejects.toThrow(
      /Invalid test file/
    );
  }, 30000);

  it("should fail when element not found", async () => {
    const testFile = await prepareFixtureYaml("missing-element.yaml");
    const result = await play(testFile, { headed: false, timeout: 2000 });

    expect(result.passed).toBe(false);
    expect(result.steps.some((s) => !s.passed)).toBe(true);
    const failedStep = result.steps.find((s) => !s.passed);
    expect(failedStep?.error).toBeDefined();
  }, 30000);
});

describe("player integration - step execution", () => {
  it("should execute click action", async () => {
    const testFile = await prepareFixtureYaml("click-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
  }, 30000);

  it("should execute fill action", async () => {
    const testFile = await prepareFixtureYaml("fill-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
  }, 30000);

  it("should respect custom timeout", async () => {
    const testFile = await prepareFixtureYaml("missing-element.yaml");
    const start = Date.now();
    const result = await play(testFile, { headed: false, timeout: 1000 });
    const duration = Date.now() - start;

    expect(result.passed).toBe(false);
    expect(duration).toBeLessThan(3000); // Should timeout quickly
  }, 30000);

  it("should stop on first failure", async () => {
    const testFile = await prepareFixtureYaml("multi-step-failure.yaml");
    const result = await play(testFile, { headed: false, timeout: 2000 });

    expect(result.passed).toBe(false);
    // Should have stopped after the failed step
    const failedIndex = result.steps.findIndex((s) => !s.passed);
    expect(result.steps).toHaveLength(failedIndex + 1);
  }, 30000);

  it("should return correct test result structure", async () => {
    const testFile = await prepareFixtureYaml("valid-test.yaml");
    const result = await play(testFile, { headed: false });

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("file");
    expect(result).toHaveProperty("steps");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("durationMs");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30000);

  it("should include step duration in results", async () => {
    const testFile = await prepareFixtureYaml("valid-test.yaml");
    const result = await play(testFile, { headed: false });

    for (const step of result.steps) {
      expect(step).toHaveProperty("durationMs");
      expect(typeof step.durationMs).toBe("number");
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("should execute chained locator expressions", async () => {
    const testFile = await writeInlineFixture("chained-locator.yaml", {
      name: "Chained Locator Test",
      baseUrl,
      steps: [
        { action: "navigate", url: "/simple-form.html" },
        {
          action: "click",
          selector: "getByRole('button', { name: /login/i }).first()",
        },
      ],
    });

    const result = await play(testFile, { headed: false, timeout: 5000 });
    expect(result.passed).toBe(true);
  }, 30000);

  it("should report clear error for invalid locator expressions", async () => {
    const testFile = await writeInlineFixture("invalid-locator.yaml", {
      name: "Invalid Locator Test",
      baseUrl,
      steps: [
        { action: "navigate", url: "/simple-form.html" },
        {
          action: "click",
          selector: "getByRole('button')['click']()",
        },
      ],
    });

    const result = await play(testFile, { headed: false, timeout: 5000 });
    expect(result.passed).toBe(false);
    const failedStep = result.steps.find((step) => !step.passed);
    expect(failedStep?.error).toMatch(/Computed property access is not allowed/);
  }, 30000);
});
