import { describe, expect, it } from "vitest";
import { stepsToYaml, yamlToTest } from "./yaml-io.js";

describe("yaml conversion", () => {
  it("serializes V2 target fields", () => {
    const yaml = stepsToYaml("Test", [
      { action: "navigate", url: "/" },
      {
        action: "click",
        target: {
          value: "#submit",
          kind: "css",
          source: "manual",
        },
      },
    ]);

    expect(yaml).toContain("name: Test");
    expect(yaml).toContain("target:");
    expect(yaml).toContain('value: "#submit"');
    expect(yaml).toContain("kind: css");
  });

  it("parses YAML into object", () => {
    const parsed = yamlToTest(`
name: T
steps:
  - action: navigate
    url: /
`);
    expect(parsed).toHaveProperty("name", "T");
  });

  it("parses YAML with legacy codegen-jsonl source", () => {
    const parsed = yamlToTest(`
name: Legacy Test
steps:
  - action: click
    target:
      value: "getByRole('button')"
      kind: locatorExpression
      source: codegen-jsonl
`);
    expect(parsed).toHaveProperty("name", "Legacy Test");
    expect(parsed).toHaveProperty("steps.0.target.source", "codegen");
  });

  it("parses YAML with legacy codegen-fallback source", () => {
    const parsed = yamlToTest(`
name: Legacy Test
steps:
  - action: click
    target:
      value: "getByRole('button')"
      kind: locatorExpression
      source: codegen-fallback
`);
    expect(parsed).toHaveProperty("name", "Legacy Test");
    expect(parsed).toHaveProperty("steps.0.target.source", "codegen");
  });

  it("normalizes legacy fallback target sources recursively", () => {
    const parsed = yamlToTest(`
name: Legacy Fallback Test
steps:
  - action: click
    target:
      value: "getByRole('button')"
      kind: locatorExpression
      source: manual
      fallbacks:
        - value: "#submit"
          kind: css
          source: codegen-fallback
`);

    expect(parsed).toHaveProperty("steps.0.target.fallbacks.0.source", "codegen");
  });

  it("parses YAML with new codegen source", () => {
    const parsed = yamlToTest(`
name: New Test
steps:
  - action: click
    target:
      value: "getByRole('button')"
      kind: locatorExpression
      source: codegen
`);
    expect(parsed).toHaveProperty("name", "New Test");
  });
});
