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

  it("accepts unrelated unknown step keys", () => {
    const result = stepSchema.safeParse({
      action: "click",
      target: cssTarget,
      unknownKey: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("stepSchema - invalid", () => {
  it("rejects selector-only deprecated steps", () => {
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

  it("rejects deprecated optional field with migration guidance", () => {
    const result = stepSchema.safeParse({
      action: "click",
      target: cssTarget,
      optional: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "optional" &&
            issue.message.includes("`optional` is no longer supported")
        )
      ).toBe(true);
    }
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
