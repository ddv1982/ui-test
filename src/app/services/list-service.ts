import fs from "node:fs/promises";
import { globby } from "globby";
import yaml from "js-yaml";
import { PLAY_DEFAULT_TEST_DIR } from "../../core/play/play-defaults.js";
import { ui } from "../../utils/ui.js";

interface ParsedYamlTest {
  name?: unknown;
  steps?: unknown;
}

export async function runList(): Promise<void> {
  const testDir = PLAY_DEFAULT_TEST_DIR;

  const files = await globby(`${testDir}/**/*.{yaml,yml}`);
  if (files.length === 0) {
    ui.warn(`No test files found in ${testDir}/`);
    ui.dim("Record a test: ui-test record");
    return;
  }

  files.sort();
  const rows: string[][] = [["File", "Name", "Steps"]];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const data = toParsedYamlTest(yaml.load(content));
      const name = formatTestName(data.name);
      const steps = Array.isArray(data.steps) ? String(data.steps.length) : "?";
      rows.push([file, name, steps]);
    } catch {
      rows.push([file, "(invalid)", "?"]);
    }
  }

  ui.heading(`Tests in ${testDir}/`);
  console.log();
  ui.table(rows);
  console.log();
  ui.dim(`${files.length} test${files.length > 1 ? "s" : ""} found`);
}

function toParsedYamlTest(value: unknown): ParsedYamlTest {
  if (value === null || typeof value !== "object") {
    return {};
  }
  return value as ParsedYamlTest;
}

function formatTestName(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "(unnamed)";
}
