import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { jsonlToSteps, stepsToYaml } from "./transformer.js";
import { ui } from "../utils/ui.js";
import { UserError } from "../utils/errors.js";

export interface RecordOptions {
  name: string;
  url: string;
  description?: string;
  outputDir: string;
}

export async function record(options: RecordOptions): Promise<string> {
  const tmpFile = path.join(
    os.tmpdir(),
    `easy-e2e-recording-${Date.now()}.jsonl`
  );

  // Ensure playwright CLI is available
  const playwrightBin = await findPlaywrightCli();

  ui.info("Opening browser for recording...");
  ui.dim("Interact with the page. Close the browser when done.");

  try {
    await runCodegen(playwrightBin, options.url, tmpFile);
  } catch (err) {
    throw new UserError(
      `Recording failed: ${err instanceof Error ? err.message : String(err)}`,
      "Make sure Playwright browsers are installed. Run: npx playwright install chromium"
    );
  }

  let jsonlContent: string;
  try {
    jsonlContent = await fs.readFile(tmpFile, "utf-8");
  } catch {
    throw new UserError(
      "No recording output found.",
      "Make sure you interact with the page before closing the browser."
    );
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }

  const steps = jsonlToSteps(jsonlContent);

  if (steps.length === 0) {
    throw new UserError(
      "No interactions were recorded.",
      "Try again and make sure to click, type, or interact with elements on the page."
    );
  }

  // Extract baseUrl from the starting URL
  let baseUrl: string | undefined;
  try {
    const parsed = new URL(options.url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    // ignore
  }

  const yamlContent = stepsToYaml(options.name, steps, {
    description: options.description,
    baseUrl,
  });

  const filename = slugify(options.name) + ".yaml";
  const outputPath = path.join(options.outputDir, filename);
  await fs.mkdir(options.outputDir, { recursive: true });
  await fs.writeFile(outputPath, yamlContent, "utf-8");

  return outputPath;
}

async function findPlaywrightCli(): Promise<string> {
  // Use the playwright package's CLI directly
  try {
    const pwPath = await import.meta.resolve?.("playwright/cli");
    if (pwPath) {
      const resolved = pwPath.startsWith("file://")
        ? new URL(pwPath).pathname
        : pwPath;
      await fs.access(resolved);
      return resolved;
    }
  } catch {
    // fallback
  }

  // Fallback: use npx playwright
  return "npx";
}

function runCodegen(
  playwrightBin: string,
  url: string,
  outputFile: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args =
      playwrightBin === "npx"
        ? ["playwright", "codegen", "--target", "jsonl", "--output", outputFile, url]
        : ["codegen", "--target", "jsonl", "--output", outputFile, url];

    const child = spawn(playwrightBin, args, {
      stdio: ["inherit", "inherit", "inherit"],
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Playwright codegen exited with code ${code}`));
      }
    });
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
