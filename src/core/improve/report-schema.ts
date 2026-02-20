import { z } from "zod";
import { stepSchema, targetSchema } from "../yaml-schema.js";

export const improveProviderSchema = z.enum(["playwright"]);

export const improveDiagnosticSchema = z.object({
  code: z.string().min(1),
  level: z.enum(["info", "warn", "error"]),
  message: z.string().min(1),
});

export const stepFindingSchema = z.object({
  index: z.number().int().nonnegative(),
  action: z.string().min(1),
  changed: z.boolean(),
  oldTarget: targetSchema,
  recommendedTarget: targetSchema,
  oldScore: z.number(),
  recommendedScore: z.number(),
  confidenceDelta: z.number(),
  reasonCodes: z.array(z.string()).default([]),
});

export const assertionApplyStatusSchema = z.enum([
  "applied",
  "skipped_low_confidence",
  "skipped_runtime_failure",
  "skipped_policy",
  "skipped_existing",
  "not_requested",
]);

export const assertionCandidateSourceSchema = z.enum([
  "deterministic",
  "snapshot_native",
]);

export const assertionApplyPolicySchema = z.enum([
  "reliable",
  "balanced",
  "aggressive",
]);

export const assertionCandidateSchema = z.object({
  index: z.number().int().nonnegative(),
  afterAction: z.string().min(1),
  candidate: stepSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  coverageFallback: z.boolean().optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  volatilityFlags: z.array(z.string()).optional(),
  candidateSource: assertionCandidateSourceSchema.optional(),
  stableStructural: z.boolean().optional(),
  applyStatus: assertionApplyStatusSchema.optional(),
  applyMessage: z.string().min(1).optional(),
});

export const improveSummarySchema = z.object({
  unchanged: z.number().int().nonnegative(),
  improved: z.number().int().nonnegative(),
  fallback: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  assertionCandidates: z.number().int().nonnegative(),
  appliedAssertions: z.number().int().nonnegative(),
  skippedAssertions: z.number().int().nonnegative(),
  selectorRepairCandidates: z.number().int().nonnegative().optional(),
  selectorRepairsApplied: z.number().int().nonnegative().optional(),
  runtimeFailingStepsRetained: z.number().int().nonnegative().optional(),
  runtimeFailingStepsOptionalized: z.number().int().nonnegative().optional(),
  runtimeFailingStepsRemoved: z.number().int().nonnegative().optional(),
  assertionCandidatesFilteredVolatile: z.number().int().nonnegative().optional(),
  assertionCoverageStepsTotal: z.number().int().nonnegative().optional(),
  assertionCoverageStepsWithCandidates: z.number().int().nonnegative().optional(),
  assertionCoverageStepsWithApplied: z.number().int().nonnegative().optional(),
  assertionCoverageCandidateRate: z.number().min(0).max(1).optional(),
  assertionCoverageAppliedRate: z.number().min(0).max(1).optional(),
  assertionInventoryStepsEvaluated: z.number().int().nonnegative().optional(),
  assertionInventoryCandidatesAdded: z.number().int().nonnegative().optional(),
  assertionInventoryGapStepsFilled: z.number().int().nonnegative().optional(),
  assertionApplyPolicy: assertionApplyPolicySchema.optional(),
  assertionApplyStatusCounts: z
    .partialRecord(assertionApplyStatusSchema, z.number().int().nonnegative())
    .optional(),
  assertionCandidateSourceCounts: z
    .partialRecord(assertionCandidateSourceSchema, z.number().int().nonnegative())
    .optional(),
});

export const improveReportSchema = z.object({
  testFile: z.string().min(1),
  generatedAt: z.string().datetime(),
  providerUsed: improveProviderSchema,
  summary: improveSummarySchema,
  stepFindings: z.array(stepFindingSchema),
  assertionCandidates: z.array(assertionCandidateSchema),
  diagnostics: z.array(improveDiagnosticSchema),
});

export type ImproveProviderUsed = z.infer<typeof improveProviderSchema>;
export type ImproveDiagnostic = z.infer<typeof improveDiagnosticSchema>;
export type StepFinding = z.infer<typeof stepFindingSchema>;
export type AssertionApplyStatus = z.infer<typeof assertionApplyStatusSchema>;
export type AssertionCandidateSource = z.infer<typeof assertionCandidateSourceSchema>;
export type AssertionApplyPolicy = z.infer<typeof assertionApplyPolicySchema>;
export type AssertionCandidate = z.infer<typeof assertionCandidateSchema>;
export type ImproveSummary = z.infer<typeof improveSummarySchema>;
export type ImproveReport = z.infer<typeof improveReportSchema>;
