import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { stepSchema } from "../yaml-schema.js";
import {
  assertionApplyPolicySchema,
  improveAppliedBySchema,
  improveDeterminismSchema,
} from "./report-schema.js";

const improvePlanPathLocatorSchema = z.enum(["absolute", "relative_to_plan"]);

const improvePlanProfileSchema = z.object({
  assertions: z.enum(["none", "candidates"]),
  assertionSource: z.enum(["deterministic", "snapshot-native"]),
  assertionPolicy: assertionApplyPolicySchema,
  applySelectors: z.boolean(),
  applyAssertions: z.boolean(),
});

const improvePlanTestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  steps: z.array(stepSchema).min(1),
});

const improvePlanDiagnosticSchema = z.object({
  code: z.string().min(1),
  level: z.enum(["info", "warn", "error"]),
  message: z.string().min(1),
});

const improvePlanAssertionCandidateSchema = z.object({
  index: z.number().int().nonnegative(),
  afterAction: z.string().min(1),
  candidate: stepSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  coverageFallback: z.boolean().optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  candidateSource: z.enum(["deterministic", "snapshot_native"]).optional(),
  stableStructural: z.boolean().optional(),
  applyStatus: z
    .enum([
      "applied",
      "skipped_low_confidence",
      "skipped_runtime_failure",
      "skipped_policy",
      "skipped_existing",
      "not_requested",
    ])
    .optional(),
  applyMessage: z.string().min(1).optional(),
});

const improvePlanSummarySchema = z.object({
  runtimeFailingStepsRetained: z.number().int().nonnegative(),
  runtimeFailingStepsRemoved: z.number().int().nonnegative(),
  skippedAssertions: z.number().int().nonnegative(),
});

const improvePlanSchemaV1 = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  testFile: z.string().min(1),
  sourceReportPath: z.string().min(1),
  appliedBy: improveAppliedBySchema,
  profile: improvePlanProfileSchema,
  test: improvePlanTestSchema,
});

const improvePlanSchemaV2 = z.object({
  version: z.literal(2),
  generatedAt: z.string().datetime(),
  testFile: z.string().min(1),
  testFileLocator: improvePlanPathLocatorSchema,
  testFileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceReportPath: z.string().min(1).optional(),
  sourceReportPathLocator: improvePlanPathLocatorSchema.optional(),
  appliedBy: improveAppliedBySchema,
  profile: improvePlanProfileSchema,
  determinism: improveDeterminismSchema.optional(),
  summary: improvePlanSummarySchema,
  diagnostics: z.array(improvePlanDiagnosticSchema),
  assertionCandidates: z.array(improvePlanAssertionCandidateSchema),
  test: improvePlanTestSchema,
});

export const improvePlanSchema = z.union([improvePlanSchemaV1, improvePlanSchemaV2]);

export type ImprovePlan = z.infer<typeof improvePlanSchema>;
export type ImprovePlanV1 = z.infer<typeof improvePlanSchemaV1>;
export type ImprovePlanV2 = z.infer<typeof improvePlanSchemaV2>;

export function defaultImprovePlanPath(testFile: string): string {
  const absolute = path.resolve(testFile);
  const ext = path.extname(absolute);
  if (ext.length === 0) {
    return `${absolute}.improve-plan.json`;
  }
  return `${absolute.slice(0, -ext.length)}.improve-plan.json`;
}

export function hashImprovePlanSource(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export function relativizePlanPath(planPath: string, targetPath: string): string {
  return path.relative(path.dirname(path.resolve(planPath)), path.resolve(targetPath));
}

export function resolvePlanPath(
  planPath: string,
  targetPath: string,
  locator: z.infer<typeof improvePlanPathLocatorSchema> = "relative_to_plan"
): string {
  if (locator === "absolute") {
    return path.resolve(targetPath);
  }
  return path.resolve(path.dirname(path.resolve(planPath)), targetPath);
}

export function sortPlanDiagnostics<T extends { code: string; level: string; message: string }>(
  diagnostics: T[]
): T[] {
  return [...diagnostics].sort((left, right) => {
    const codeDelta = left.code.localeCompare(right.code);
    if (codeDelta !== 0) return codeDelta;
    const levelDelta = left.level.localeCompare(right.level);
    if (levelDelta !== 0) return levelDelta;
    return left.message.localeCompare(right.message);
  });
}

export function sortPlanAssertionCandidates<
  T extends {
    index: number;
    afterAction: string;
    candidate: { action: string };
    confidence: number;
    rationale: string;
  },
>(candidates: T[]): T[] {
  return [...candidates].sort((left, right) => {
    const indexDelta = left.index - right.index;
    if (indexDelta !== 0) return indexDelta;
    const actionDelta = left.afterAction.localeCompare(right.afterAction);
    if (actionDelta !== 0) return actionDelta;
    const candidateActionDelta = left.candidate.action.localeCompare(right.candidate.action);
    if (candidateActionDelta !== 0) return candidateActionDelta;
    const confidenceDelta = right.confidence - left.confidence;
    if (confidenceDelta !== 0) return confidenceDelta;
    return left.rationale.localeCompare(right.rationale);
  });
}
