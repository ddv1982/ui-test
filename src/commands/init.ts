import type { Command } from "commander";
import { input, confirm } from "@inquirer/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";

interface EasyE2EConfig {
  testDir: string;
  baseUrl: string;
  headed: boolean;
  timeout: number;
}

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Set up a new easy-e2e test project")
    .action(async () => {
      try {
        await runInit();
      } catch (err) {
        handleError(err);
      }
    });
}

async function runInit() {
  ui.heading("easy-e2e project setup");
  console.log();

  const testDir = await input({
    message: "Where should tests be stored?",
    default: "tests",
  });

  const baseUrl = await input({
    message: "What is your application's base URL?",
    default: "http://localhost:3000",
  });

  const headed = await confirm({
    message: "Run tests in headed mode by default? (visible browser)",
    default: false,
  });

  const timeout = await input({
    message: "Default step timeout in milliseconds?",
    default: "10000",
    validate: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? true : "Must be a positive number"),
  });

  const config: EasyE2EConfig = {
    testDir,
    baseUrl,
    headed,
    timeout: Number(timeout),
  };

  const configPath = path.resolve("easy-e2e.config.yaml");
  await fs.writeFile(configPath, yaml.dump(config, { quotingType: '"' }), "utf-8");

  await fs.mkdir(path.resolve(testDir), { recursive: true });

  // Create a sample test file
  const samplePath = path.join(path.resolve(testDir), "example.yaml");
  const sampleExists = await fs.access(samplePath).then(() => true).catch(() => false);

  if (!sampleExists) {
    const sample = {
      name: "Example Test",
      description: "A sample test to get you started",
      baseUrl,
      steps: [
        { action: "navigate", url: "/" },
        {
          action: "assertVisible",
          description: "Page has loaded",
          selector: "body",
        },
      ],
    };
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    ui.step(`Created sample test: ${samplePath}`);
  }

  console.log();
  ui.success(`Config saved to ${configPath}`);
  ui.success(`Test directory created: ${testDir}/`);
  console.log();
  ui.info("Next steps:");
  ui.step("Record a test: npx easy-e2e record");
  ui.step("Run tests: npx easy-e2e play");
  ui.step("List tests: npx easy-e2e list");
}
