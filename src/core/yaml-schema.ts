import { z } from "zod";

const navigateStep = z.object({
  action: z.literal("navigate"),
  url: z.string(),
  description: z.string().optional(),
});

const selectorStep = z.object({
  selector: z.string(),
  description: z.string().optional(),
});

const clickStep = selectorStep.extend({ action: z.literal("click") });
const hoverStep = selectorStep.extend({ action: z.literal("hover") });
const checkStep = selectorStep.extend({ action: z.literal("check") });
const uncheckStep = selectorStep.extend({ action: z.literal("uncheck") });

const fillStep = selectorStep.extend({
  action: z.literal("fill"),
  text: z.string(),
});

const pressStep = selectorStep.extend({
  action: z.literal("press"),
  key: z.string(),
});

const selectStep = selectorStep.extend({
  action: z.literal("select"),
  value: z.string(),
});

const assertVisibleStep = selectorStep.extend({
  action: z.literal("assertVisible"),
});

const assertTextStep = selectorStep.extend({
  action: z.literal("assertText"),
  text: z.string(),
});

const assertValueStep = selectorStep.extend({
  action: z.literal("assertValue"),
  value: z.string(),
});

const assertCheckedStep = selectorStep.extend({
  action: z.literal("assertChecked"),
  checked: z.boolean().optional().default(true),
});

export const stepSchema = z.discriminatedUnion("action", [
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

export const testSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  steps: z.array(stepSchema).min(1, "Test must have at least one step"),
});

export type TestFile = z.infer<typeof testSchema>;
export type Step = z.infer<typeof stepSchema>;
