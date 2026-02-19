import { z } from "zod";

const STEP_OPTIONAL_REMOVED_MESSAGE =
  "`optional` is no longer supported. Remove this field from the step.";

const fallbackTargetSchema = z.object({
  value: z.string().min(1),
  kind: z.enum([
    "locatorExpression",
    "playwrightSelector",
    "css",
    "xpath",
    "internal",
    "unknown",
  ]),
  source: z.enum(["manual", "codegen-jsonl", "codegen-fallback"]),
});

export const targetSchema = z.object({
  value: z.string().min(1),
  kind: z.enum([
    "locatorExpression",
    "playwrightSelector",
    "css",
    "xpath",
    "internal",
    "unknown",
  ]),
  source: z.enum(["manual", "codegen-jsonl", "codegen-fallback"]),
  framePath: z.array(z.string()).optional(),
  raw: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  warning: z.string().optional(),
  fallbacks: z.array(fallbackTargetSchema).max(2).optional(),
});

const baseStep = z.object({
  description: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

const navigateStep = baseStep.extend({
  action: z.literal("navigate"),
  url: z.string(),
});

const targetStep = baseStep.extend({
  target: targetSchema,
});

const clickStep = targetStep.extend({ action: z.literal("click") });
const hoverStep = targetStep.extend({ action: z.literal("hover") });
const checkStep = targetStep.extend({ action: z.literal("check") });
const uncheckStep = targetStep.extend({ action: z.literal("uncheck") });

const fillStep = targetStep.extend({
  action: z.literal("fill"),
  text: z.string(),
});

const pressStep = targetStep.extend({
  action: z.literal("press"),
  key: z.string(),
});

const selectStep = targetStep.extend({
  action: z.literal("select"),
  value: z.string(),
});

const assertVisibleStep = targetStep.extend({
  action: z.literal("assertVisible"),
});

const assertTextStep = targetStep.extend({
  action: z.literal("assertText"),
  text: z.string(),
});

const assertValueStep = targetStep.extend({
  action: z.literal("assertValue"),
  value: z.string(),
});

const assertCheckedStep = targetStep.extend({
  action: z.literal("assertChecked"),
  checked: z.boolean().optional().default(true),
});

const stepOptionalDeprecationGuard = z.unknown().superRefine((value, ctx) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (Object.prototype.hasOwnProperty.call(value, "optional")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["optional"],
      message: STEP_OPTIONAL_REMOVED_MESSAGE,
    });
  }
});

const stepSchemaByAction = z.discriminatedUnion("action", [
  navigateStep,
  clickStep,
  fillStep,
  pressStep,
  checkStep,
  uncheckStep,
  hoverStep,
  selectStep,
  assertVisibleStep,
  assertTextStep,
  assertValueStep,
  assertCheckedStep,
]);

export const stepSchema = stepOptionalDeprecationGuard.pipe(stepSchemaByAction);

export const testSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  steps: z.array(stepSchema).min(1, "Test must have at least one step"),
});

export type TestFile = z.infer<typeof testSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Target = z.infer<typeof targetSchema>;
export type FallbackTarget = z.infer<typeof fallbackTargetSchema>;
