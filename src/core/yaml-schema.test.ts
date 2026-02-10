import { describe, it, expect } from "vitest";
import { testSchema, stepSchema } from "./yaml-schema.js";

describe("stepSchema - valid steps", () => {
  it("should validate navigate step", () => {
    const step = { action: "navigate", url: "https://example.com" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate navigate step with description", () => {
    const step = {
      action: "navigate",
      url: "/login",
      description: "Go to login page",
    };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate click step", () => {
    const step = { action: "click", selector: "button" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate fill step", () => {
    const step = { action: "fill", selector: "#email", text: "test@example.com" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate press step", () => {
    const step = { action: "press", selector: "#search", key: "Enter" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate check step", () => {
    const step = { action: "check", selector: "#agree" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate uncheck step", () => {
    const step = { action: "uncheck", selector: "#disagree" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate hover step", () => {
    const step = { action: "hover", selector: ".menu-item" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate select step", () => {
    const step = { action: "select", selector: "#country", value: "us" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate assertVisible step", () => {
    const step = { action: "assertVisible", selector: "h1" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate assertText step", () => {
    const step = { action: "assertText", selector: "h1", text: "Welcome" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate assertValue step", () => {
    const step = { action: "assertValue", selector: "#email", value: "test@example.com" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it("should validate assertChecked step with default checked=true", () => {
    const step = { action: "assertChecked", selector: "#agree" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
    if (result.success && result.data.action === "assertChecked") {
      expect(result.data.checked).toBe(true);
    }
  });

  it("should validate assertChecked step with explicit checked=false", () => {
    const step = { action: "assertChecked", selector: "#disagree", checked: false };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(true);
    if (result.success && result.data.action === "assertChecked") {
      expect(result.data.checked).toBe(false);
    }
  });
});

describe("stepSchema - invalid steps", () => {
  it("should reject navigate step without url", () => {
    const step = { action: "navigate" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject click step without selector", () => {
    const step = { action: "click" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject fill step without text", () => {
    const step = { action: "fill", selector: "#input" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject press step without key", () => {
    const step = { action: "press", selector: "#input" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject select step without value", () => {
    const step = { action: "select", selector: "#country" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject assertText step without text", () => {
    const step = { action: "assertText", selector: "h1" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject assertValue step without value", () => {
    const step = { action: "assertValue", selector: "#email" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject step with unknown action", () => {
    const step = { action: "unknown", selector: "button" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it("should reject step with wrong type for action", () => {
    const step = { action: 123, selector: "button" };
    const result = stepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });
});

describe("testSchema - valid tests", () => {
  it("should validate minimal test with required fields", () => {
    const test = {
      name: "Test",
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(true);
  });

  it("should validate test with description", () => {
    const test = {
      name: "Test",
      description: "Test description",
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(true);
  });

  it("should validate test with valid baseUrl", () => {
    const test = {
      name: "Test",
      baseUrl: "https://example.com",
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(true);
  });

  it("should validate test with http baseUrl", () => {
    const test = {
      name: "Test",
      baseUrl: "http://localhost:3000",
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(true);
  });

  it("should validate test with multiple steps", () => {
    const test = {
      name: "Multi-step Test",
      steps: [
        { action: "navigate", url: "/" },
        { action: "click", selector: "button" },
        { action: "fill", selector: "#input", text: "test" },
      ],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(true);
  });
});

describe("testSchema - invalid tests", () => {
  it("should reject test without name", () => {
    const test = {
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(false);
  });

  it("should reject test without steps", () => {
    const test = {
      name: "Test",
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(false);
  });

  it("should reject test with empty steps array", () => {
    const test = {
      name: "Test",
      steps: [],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(false);
  });

  it("should reject test with invalid baseUrl", () => {
    const test = {
      name: "Test",
      baseUrl: "not-a-url",
      steps: [{ action: "navigate", url: "/" }],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(false);
  });

  it("should reject test with invalid step in steps array", () => {
    const test = {
      name: "Test",
      steps: [
        { action: "navigate", url: "/" },
        { action: "click" }, // missing selector
      ],
    };
    const result = testSchema.safeParse(test);
    expect(result.success).toBe(false);
  });
});
