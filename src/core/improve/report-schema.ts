import { z } from "zod";
import { stepSchema, targetSchema } from "../yaml-schema.js";

export const improveProviderSchema = z.enum(["playwright", "none"]);

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
  "skipped_existing",
  "not_requested",
]);

export const assertionCandidateSourceSchema = z.enum([
  "deterministic",
  "snapshot_cli",
]);

export const assertionCandidateSchema = z.object({
  index: z.number().int().nonnegative(),
  afterAction: z.string().min(1),
  candidate: stepSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  candidateSource: assertionCandidateSourceSchema.optional(),
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
export type AssertionCandidate = z.infer<typeof assertionCandidateSchema>;
export type ImproveSummary = z.infer<typeof improveSummarySchema>;
export type ImproveReport = z.infer<typeof improveReportSchema>;
