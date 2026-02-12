import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { record as runRecording } from "../core/recorder.js";
import { loadConfig } from "../utils/config.js";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

export function registerRecord(program: Command) {
  program
    .command("record")
    .description("Record browser interactions and save as a YAML test")
    .option("-n, --name <name>", "Test name")
    .option("-u, --url <url>", "Starting URL")
    .option("-d, --description <desc>", "Test description")
    .action(async (opts) => {
      try {
        await runRecord(opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runRecord(opts: {
  name?: string;
  url?: string;
  description?: string;
}) {
  const config = await loadConfig();

  const name =
    opts.name ??
    (await input({
      message: "Test name:",
      validate: (v) => (v.trim().length > 0 ? true : "Name is required"),
    }));

  const url =
    opts.url ??
    (await input({
      message: "Starting URL:",
      default: config.baseUrl ?? "http://localhost:3000",
    }));

  const description =
    opts.description ??
    (await input({
      message: "Description (optional):",
    }));

  const outputPath = await runRecording({
    name,
    url,
    description: description || undefined,
    outputDir: config.testDir ?? "e2e",
  });

  console.log();
  ui.success(`Test saved to ${outputPath}`);
  ui.info("Run it with: npx ui-test play " + outputPath);
}
