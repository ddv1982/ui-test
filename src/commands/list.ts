import type { Command } from "commander";
import fs from "node:fs/promises";
import { globby } from "globby";
import yaml from "js-yaml";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

export function registerList(program: Command) {
  program
    .command("list")
    .description("List all recorded tests")
    .action(async () => {
      try {
        await runList();
      } catch (err) {
        handleError(err);
      }
    });
}

async function runList() {
  const config = await loadConfig();
  const testDir = config.testDir ?? "e2e";

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
      const data = yaml.load(content) as Record<string, unknown>;
      const name = formatTestName(data?.name);
      const steps = Array.isArray(data?.steps) ? String(data.steps.length) : "?";
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

function formatTestName(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "(unnamed)";
}
