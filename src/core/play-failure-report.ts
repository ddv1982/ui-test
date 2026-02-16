import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const PLAY_REPORT_SCHEMA_VERSION = "1.0";

const stepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  action: z.string().min(1),
  passed: z.boolean(),
  skipped: z.boolean().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});

const playFailureReportSchema = z.object({
  schemaVersion: z.literal(PLAY_REPORT_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  runId: z.string().min(1),
  test: z.object({
    name: z.string().min(1),
    file: z.string().min(1),
    slug: z.string().min(1),
  }),
  failure: z.object({
    stepIndex: z.number().int().nonnegative(),
    action: z.string().min(1),
    error: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
  }),
  steps: z.array(stepResultSchema),
  artifacts: z.object({
    tracePath: z.string().min(1).optional(),
    screenshotPath: z.string().min(1).optional(),
  }),
  warnings: z.array(z.string()),
});

const playRunReportSchema = z.object({
  schemaVersion: z.literal(PLAY_REPORT_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  runId: z.string().min(1),
  summary: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
  failedTests: z.array(
    z.object({
      name: z.string().min(1),
      file: z.string().min(1),
      slug: z.string().min(1),
      failure: z.object({
        stepIndex: z.number().int().nonnegative(),
        action: z.string().min(1),
        error: z.string().min(1),
      }),
      artifacts: z.object({
        reportPath: z.string().min(1).optional(),
        tracePath: z.string().min(1).optional(),
        screenshotPath: z.string().min(1).optional(),
      }),
      warnings: z.array(z.string()),
    })
  ),
});

export type PlayFailureReportStep = z.infer<typeof stepResultSchema>;
export type PlayFailureReport = z.infer<typeof playFailureReportSchema>;
export type PlayRunReport = z.infer<typeof playRunReportSchema>;

export interface PlayFailureArtifactPaths {
  artifactsRootDir: string;
  runDir: string;
  testDir: string;
  testSlug: string;
  reportPath: string;
  tracePath: string;
  screenshotPath: string;
}

export function createPlayRunId(now = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `run-${iso}`;
}

export function createTestSlug(testFilePath: string, cwd = process.cwd()): string {
  const absolute = path.resolve(testFilePath);
  const relative = path.relative(cwd, absolute);
  const relativeForSlug = relative.startsWith("..") ? absolute : relative;
  const normalized = relativeForSlug.replaceAll(path.sep, "/");
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const base = sanitized || "test";
  const hash = createHash("sha1").update(absolute).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

export function buildPlayFailureArtifactPaths(input: {
  artifactsDir: string;
  runId: string;
  testFilePath: string;
}): PlayFailureArtifactPaths {
  const artifactsRootDir = path.resolve(input.artifactsDir);
  const runDir = path.join(artifactsRootDir, "runs", input.runId);
  const testSlug = createTestSlug(input.testFilePath);
  const testDir = path.join(runDir, "tests", testSlug);

  return {
    artifactsRootDir,
    runDir,
    testDir,
    testSlug,
    reportPath: path.join(testDir, "failure-report.json"),
    tracePath: path.join(testDir, "trace.zip"),
    screenshotPath: path.join(testDir, "failure.png"),
  };
}

export function buildPlayRunReportPath(artifactsDir: string, runId: string): string {
  return path.join(path.resolve(artifactsDir), "runs", runId, "run-report.json");
}

export function buildPlayFailureReport(input: {
  runId: string;
  testName: string;
  testFile: string;
  testSlug: string;
  failure: {
    stepIndex: number;
    action: string;
    error: string;
    durationMs: number;
  };
  steps: PlayFailureReportStep[];
  artifacts: {
    tracePath?: string;
    screenshotPath?: string;
  };
  warnings: string[];
  generatedAt?: string;
}): PlayFailureReport {
  return playFailureReportSchema.parse({
    schemaVersion: PLAY_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runId: input.runId,
    test: {
      name: input.testName,
      file: path.resolve(input.testFile),
      slug: input.testSlug,
    },
    failure: input.failure,
    steps: input.steps,
    artifacts: input.artifacts,
    warnings: input.warnings,
  });
}

export async function writePlayFailureReport(
  report: PlayFailureReport,
  reportPath: string
): Promise<void> {
  const validated = playFailureReportSchema.parse(report);
  await writeJsonFile(reportPath, validated);
}

export async function writePlayRunReport(
  report: PlayRunReport,
  options: { artifactsDir: string; runId: string }
): Promise<string> {
  const validated = playRunReportSchema.parse(report);
  const runReportPath = buildPlayRunReportPath(options.artifactsDir, options.runId);
  await writeJsonFile(runReportPath, validated);
  return runReportPath;
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

