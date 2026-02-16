import { describe, it, expect } from "vitest";
import { testSchema, stepSchema, targetSchema } from "./yaml-schema.js";

const cssTarget = {
  value: "#submit",
  kind: "css",
  source: "manual",
} as const;

describe("targetSchema", () => {
  it("validates required fields", () => {
    const result = targetSchema.safeParse(cssTarget);
    expect(result.success).toBe(true);
  });

  it("validates optional metadata", () => {
    const result = targetSchema.safeParse({
      value: "getByRole('button', { name: 'Save' })",
      kind: "locatorExpression",
      source: "codegen-jsonl",
      framePath: ["iframe[name='checkout']"],
      raw: "internal:role=button[name=\"save\"i]",
      confidence: 0.7,
      warning: "fallback",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid confidence", () => {
    const result = targetSchema.safeParse({
      ...cssTarget,
      confidence: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("stepSchema - valid", () => {
  it("validates navigate", () => {
    expect(stepSchema.safeParse({ action: "navigate", url: "/" }).success).toBe(true);
  });

  it("validates click with V2 target", () => {
    expect(stepSchema.safeParse({ action: "click", target: cssTarget }).success).toBe(true);
  });

  it("validates fill/press/select/assertions", () => {
    expect(
      stepSchema.safeParse({ action: "fill", target: cssTarget, text: "hello" }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "press", target: cssTarget, key: "Enter" }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "select", target: cssTarget, value: "us" }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "assertVisible", target: cssTarget }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "assertText", target: cssTarget, text: "Welcome" }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "assertValue", target: cssTarget, value: "test" }).success
    ).toBe(true);
    expect(
      stepSchema.safeParse({ action: "assertChecked", target: cssTarget, checked: false }).success
    ).toBe(true);
  });
});

describe("stepSchema - optional", () => {
  it("accepts optional: true on click step", () => {
    const result = stepSchema.safeParse({
      action: "click",
      target: cssTarget,
      optional: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optional).toBe(true);
    }
  });

  it("accepts optional: true on navigate step", () => {
    const result = stepSchema.safeParse({
      action: "navigate",
      url: "/maybe",
      optional: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts step without optional (backward compat)", () => {
    const result = stepSchema.safeParse({
      action: "click",
      target: cssTarget,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.optional).toBeUndefined();
    }
  });
});

describe("stepSchema - invalid", () => {
  it("rejects selector-only legacy steps", () => {
    expect(stepSchema.safeParse({ action: "click", selector: "#submit" }).success).toBe(false);
  });

  it("rejects targetless selector actions", () => {
    expect(stepSchema.safeParse({ action: "click" }).success).toBe(false);
    expect(stepSchema.safeParse({ action: "fill", text: "x" }).success).toBe(false);
  });

  it("rejects wrong target kind", () => {
    expect(
      stepSchema.safeParse({
        action: "click",
        target: { ...cssTarget, kind: "cssXpath" },
      }).success
    ).toBe(false);
  });
});

describe("testSchema", () => {
  it("validates a full test", () => {
    const test = {
      name: "My test",
      baseUrl: "https://example.com",
      steps: [
        { action: "navigate", url: "/" },
        { action: "click", target: cssTarget },
      ],
    };
    expect(testSchema.safeParse(test).success).toBe(true);
  });

  it("rejects invalid tests", () => {
    expect(testSchema.safeParse({ name: "x", steps: [] }).success).toBe(false);
    expect(
      testSchema.safeParse({ name: "x", baseUrl: "nope", steps: [{ action: "navigate", url: "/" }] })
        .success
    ).toBe(false);
  });
});
