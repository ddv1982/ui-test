import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { improveTestFile } from "./improve.js";
import { play } from "../play/player-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_FIXTURE_DIR = join(__dirname, "../../../tests/fixtures/html");
const REQUIRE_HEADED_PARITY = process.env["UI_TEST_REQUIRE_HEADED_PARITY"] === "1";

let server: Server;
let baseUrl = "";
let tempDir = "";
let headedSupported = false;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ui-test-improve-volatile-"));
  headedSupported = await canLaunchHeadedChromium();

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

describe("improve volatile acceptance benchmark", () => {
  it("repairs brittle exact news locator and turns baseline failure into pass", async () => {
    const yamlPath = join(tempDir, "volatile-news.yaml");
    await writeFile(
      yamlPath,
      [
        "name: volatile-news",
        `baseUrl: ${baseUrl}`,
        "steps:",
        "  - action: navigate",
        '    url: "/volatile-news.html"',
        "  - action: click",
        "    target:",
        '      value: "getByRole(\'link\', { name: \'Schiphol vluchten winterweer update 12:30\', exact: true })"',
        "      kind: locatorExpression",
        "      source: manual",
        "  - action: assertVisible",
        "    target:",
        '      value: "#article"',
        "      kind: css",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );

    const baseline = await play(yamlPath, { headed: false, timeout: 2500 });
    expect(baseline.passed).toBe(false);

    const improved = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(improved.report.summary.improved).toBeGreaterThanOrEqual(1);

    const improvedYaml = await readFile(yamlPath, "utf-8");
    expect(improvedYaml).not.toContain("exact: true");
    expect(improvedYaml).not.toContain("Schiphol vluchten winterweer update 12:30");
    expect(improvedYaml).not.toContain("optional:");
    expect(improvedYaml).toContain("getByRole('link'");

    const headlessReplay = await play(yamlPath, { headed: false, timeout: 2500 });
    expect(headlessReplay.passed).toBe(true);

    if (!headedSupported) {
      if (REQUIRE_HEADED_PARITY) {
        throw new Error(
          "Headed Chromium is unavailable while parity is required (UI_TEST_REQUIRE_HEADED_PARITY=1)."
        );
      }
      return;
    }

    const headedReplay = await play(yamlPath, { headed: true, timeout: 2500 });
    expect(headedReplay.passed).toBe(true);
  }, 45000);
});

async function canLaunchHeadedChromium(): Promise<boolean> {
  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch({ headless: false });
    return true;
  } catch {
    return false;
  } finally {
    await browser?.close().catch(() => {});
  }
}
