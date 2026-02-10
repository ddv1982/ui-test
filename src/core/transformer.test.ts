import { describe, it, expect } from "vitest";
import { jsonlToSteps, stepsToYaml, yamlToTest } from "./transformer.js";

describe("jsonlToSteps", () => {
  it("should parse navigate action", () => {
    const jsonl = '{"type":"navigate","url":"https://example.com"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([{ action: "navigate", url: "https://example.com" }]);
  });

  it("should parse click action", () => {
    const jsonl = '{"type":"click","selector":"button"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([{ action: "click", selector: "button" }]);
  });

  it("should parse fill action", () => {
    const jsonl = '{"type":"fill","selector":"#email","text":"test@example.com"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([
      { action: "fill", selector: "#email", text: "test@example.com" },
    ]);
  });

  it("should parse press action", () => {
    const jsonl = '{"type":"press","selector":"#search","key":"Enter"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([
      { action: "press", selector: "#search", key: "Enter" },
    ]);
  });

  it("should parse check action", () => {
    const jsonl = '{"type":"check","selector":"#agree"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([{ action: "check", selector: "#agree" }]);
  });

  it("should parse uncheck action", () => {
    const jsonl = '{"type":"uncheck","selector":"#agree"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([{ action: "uncheck", selector: "#agree" }]);
  });

  it("should parse hover action", () => {
    const jsonl = '{"type":"hover","selector":".menu"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([{ action: "hover", selector: ".menu" }]);
  });

  it("should parse select action", () => {
    const jsonl = '{"type":"select","selector":"#country","value":"us"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toEqual([
      { action: "select", selector: "#country", value: "us" },
    ]);
  });

  it("should parse multiple actions from multiple lines", () => {
    const jsonl = [
      '{"type":"navigate","url":"https://example.com"}',
      '{"type":"click","selector":"button"}',
      '{"type":"fill","selector":"#email","text":"test@example.com"}',
    ].join("\n");
    const steps = jsonlToSteps(jsonl);
    expect(steps).toHaveLength(3);
    expect(steps[0].action).toBe("navigate");
    expect(steps[1].action).toBe("click");
    expect(steps[2].action).toBe("fill");
  });
});

describe("jsonlToSteps - edge cases", () => {
  it("should skip malformed JSON lines", () => {
    const jsonl = [
      '{"type":"navigate","url":"https://example.com"}',
      'this is not valid JSON',
      '{"type":"click","selector":"button"}',
    ].join("\n");
    const steps = jsonlToSteps(jsonl);
    expect(steps).toHaveLength(2);
  });

  it("should skip empty lines", () => {
    const jsonl = [
      '{"type":"navigate","url":"https://example.com"}',
      "",
      "   ",
      '{"type":"click","selector":"button"}',
    ].join("\n");
    const steps = jsonlToSteps(jsonl);
    expect(steps).toHaveLength(2);
  });

  it("should return empty array for empty input", () => {
    const steps = jsonlToSteps("");
    expect(steps).toEqual([]);
  });

  it("should skip actions with missing required fields", () => {
    const jsonl = [
      '{"type":"click"}',
      '{"type":"fill","selector":"#input"}',
      '{"type":"navigate","url":"https://example.com"}',
    ].join("\n");
    const steps = jsonlToSteps(jsonl);
    // Click without selector is skipped, fill with empty text is included, navigate is included
    expect(steps).toHaveLength(2);
    expect(steps[0].action).toBe("fill");
    expect(steps[1].action).toBe("navigate");
  });

  it("should skip unsupported action types", () => {
    const jsonl = [
      '{"type":"unknown","selector":"button"}',
      '{"type":"click","selector":"button"}',
    ].join("\n");
    const steps = jsonlToSteps(jsonl);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe("click");
  });

  it("should handle special characters in text and selectors", () => {
    const jsonl = '{"type":"fill","selector":"input[name=\\"user\\"]","text":"Test \\"quoted\\" text"}';
    const steps = jsonlToSteps(jsonl);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe("fill");
  });
});

describe("stepsToYaml", () => {
  it("should generate YAML with name and steps", () => {
    const steps = [
      { action: "navigate" as const, url: "https://example.com" },
      { action: "click" as const, selector: "button" },
    ];
    const yaml = stepsToYaml("Test", steps);
    expect(yaml).toContain('name: Test');
    expect(yaml).toContain("action: navigate");
    expect(yaml).toContain("action: click");
  });

  it("should include description when provided", () => {
    const steps = [{ action: "navigate" as const, url: "/" }];
    const yaml = stepsToYaml("Test", steps, {
      description: "Test description",
    });
    expect(yaml).toContain('description: Test description');
  });

  it("should include baseUrl when provided", () => {
    const steps = [{ action: "navigate" as const, url: "/" }];
    const yaml = stepsToYaml("Test", steps, {
      baseUrl: "https://example.com",
    });
    expect(yaml).toContain('baseUrl: https://example.com');
  });

  it("should not include optional fields when not provided", () => {
    const steps = [{ action: "navigate" as const, url: "/" }];
    const yaml = stepsToYaml("Test", steps);
    expect(yaml).not.toContain("description:");
    expect(yaml).not.toContain("baseUrl:");
  });

  it("should format steps array correctly", () => {
    const steps = [
      { action: "navigate" as const, url: "/login" },
      { action: "fill" as const, selector: "#username", text: "testuser" },
      { action: "click" as const, selector: "button[type=submit]" },
    ];
    const yaml = stepsToYaml("Login Test", steps);
    expect(yaml).toContain("steps:");
    expect(yaml).toContain("- action: navigate");
    expect(yaml).toContain('url: /login');
    expect(yaml).toContain("- action: fill");
    expect(yaml).toContain('selector: "#username"');
  });
});

describe("yamlToTest", () => {
  it("should parse valid YAML", () => {
    const yaml = `
name: Test
steps:
  - action: navigate
    url: https://example.com
  - action: click
    selector: button
`;
    const result = yamlToTest(yaml);
    expect(result).toHaveProperty("name", "Test");
    expect(result).toHaveProperty("steps");
    expect(Array.isArray((result as any).steps)).toBe(true);
  });

  it("should parse YAML with all optional fields", () => {
    const yaml = `
name: Full Test
description: Test with all fields
baseUrl: https://example.com
steps:
  - action: navigate
    url: /
    description: Go to home
`;
    const result = yamlToTest(yaml);
    expect(result).toHaveProperty("name", "Full Test");
    expect(result).toHaveProperty("description", "Test with all fields");
    expect(result).toHaveProperty("baseUrl", "https://example.com");
  });
});
