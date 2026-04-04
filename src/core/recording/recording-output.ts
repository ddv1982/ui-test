import fs from "node:fs/promises";
import path from "node:path";
import type { Step } from "../yaml-schema.js";
import { stepsToYaml } from "../transform/yaml-io.js";
import { canonicalEventsToSteps, stepsToCanonicalEvents } from "./canonical-events.js";

export interface SaveRecordedYamlOptions {
  name: string;
  outputDir: string;
  steps: Step[];
  description?: string;
  startingUrl?: string;
  now?: () => number;
}

export interface SaveRecordedYamlResult {
  outputPath: string;
  steps: Step[];
}

export async function saveRecordedYaml(
  options: SaveRecordedYamlOptions
): Promise<SaveRecordedYamlResult> {
  const normalizedSteps = normalizeRecordedSteps(options.steps, options.startingUrl);
  const yamlOptions: { description?: string; baseUrl?: string } = {};
  if (options.description !== undefined) {
    yamlOptions.description = options.description;
  }

  const baseUrl = deriveBaseUrl(options.startingUrl);
  if (baseUrl !== undefined) {
    yamlOptions.baseUrl = baseUrl;
  }

  const yamlContent = stepsToYaml(options.name, normalizedSteps, yamlOptions);
  const outputPath = defaultRecordedYamlPath(options.outputDir, options.name, options.now);
  await fs.mkdir(options.outputDir, { recursive: true });
  await fs.writeFile(outputPath, yamlContent, "utf-8");

  return {
    outputPath,
    steps: normalizedSteps,
  };
}

export function defaultRecordedYamlPath(
  outputDir: string,
  name: string,
  now: (() => number) | undefined = undefined
): string {
  const slug = slugify(name) || `test-${(now ?? Date.now)()}`;
  return path.join(outputDir, `${slug}.yaml`);
}

export function normalizeRecordedSteps(steps: Step[], startingUrl?: string): Step[] {
  const normalizedSteps =
    startingUrl === undefined ? steps : normalizeFirstNavigate(steps, startingUrl);
  return canonicalEventsToSteps(stepsToCanonicalEvents(normalizedSteps));
}

export function deriveBaseUrl(url?: string): string | undefined {
  if (url === undefined) return undefined;

  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeFirstNavigate(steps: Step[], startingUrl: string): Step[] {
  let startPath: string;
  try {
    const parsed = new URL(startingUrl);
    startPath = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return steps;
  }

  if (steps.length === 0) return steps;

  const firstStep = steps[0];
  if (firstStep?.action === "navigate") {
    return [{ ...firstStep, url: startPath }, ...steps.slice(1)];
  }

  return [{ action: "navigate" as const, url: startPath }, ...steps];
}
