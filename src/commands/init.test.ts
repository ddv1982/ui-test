import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_BASE_ORIGIN,
  DEFAULT_PORT,
  buildBaseUrl,
  buildDefaultStartCommand,
  migrateStockSample,
  validateBaseOrigin,
  validatePortInput,
} from "./init.js";

describe("init URL helpers", () => {
  it("uses Vue-first defaults for init prompts", () => {
    expect(DEFAULT_BASE_ORIGIN).toBe("http://127.0.0.1");
    expect(DEFAULT_PORT).toBe("5173");
    expect(buildDefaultStartCommand("http://127.0.0.1:5173")).toBe(
      "npx easy-e2e example-app --host 127.0.0.1 --port 5173"
    );
  });

  describe("validateBaseOrigin", () => {
    it("accepts valid http origins", () => {
      expect(validateBaseOrigin("http://localhost")).toBe(true);
      expect(validateBaseOrigin("https://example.com")).toBe(true);
    });

    it("rejects invalid protocols", () => {
      expect(validateBaseOrigin("ftp://localhost")).toMatch(/Protocol must be/);
    });

    it("rejects paths and query fragments", () => {
      expect(validateBaseOrigin("http://localhost/app")).toMatch(/protocol \+ host/i);
      expect(validateBaseOrigin("https://example.com?x=1")).toMatch(/protocol \+ host/i);
    });
  });

  describe("validatePortInput", () => {
    it("accepts blank and valid ports", () => {
      expect(validatePortInput("")).toBe(true);
      expect(validatePortInput("4000")).toBe(true);
    });

    it("rejects invalid port values", () => {
      expect(validatePortInput("0")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("70000")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("abc")).toMatch(/between 1 and 65535/);
    });
  });

  describe("buildBaseUrl", () => {
    it("sets explicit port when provided", () => {
      expect(buildBaseUrl("http://localhost", "4000")).toBe("http://localhost:4000");
    });

    it("keeps default origin port when blank", () => {
      expect(buildBaseUrl("https://example.com", "")).toBe("https://example.com");
      expect(buildBaseUrl("https://example.com:8443", "")).toBe("https://example.com:8443");
    });
  });

  describe("buildDefaultStartCommand", () => {
    it("builds local HTTP example server command", () => {
      expect(buildDefaultStartCommand("http://localhost:4000")).toBe(
        "npx easy-e2e example-app --host localhost --port 4000"
      );
    });

    it("returns blank for non-local or non-http targets", () => {
      expect(buildDefaultStartCommand("https://example.com")).toBe("");
      expect(buildDefaultStartCommand("http://example.com:3000")).toBe("");
    });
  });
});

describe("migrateStockSample", () => {
  it("migrates stock sample to #app selector and removes baseUrl", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "easy-e2e-init-test-"));
    const samplePath = path.join(dir, "example.yaml");

    const content = `
name: Example Test
baseUrl: http://localhost:3000
steps:
  - action: navigate
    url: /
  - action: assertVisible
    description: Page has loaded
    selector: body
`;

    await fs.writeFile(samplePath, content, "utf-8");

    const migrated = await migrateStockSample(samplePath);
    expect(migrated).toBe(true);

    const updated = await fs.readFile(samplePath, "utf-8");
    expect(updated).not.toContain("baseUrl:");
    expect(updated).toContain('selector: "#app"');
  });
});
