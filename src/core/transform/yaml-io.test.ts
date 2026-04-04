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

  it("normalizes inline frameLocator chains in YAML targets into framePath metadata", () => {
    const parsed = yamlToTest(`
name: Frame Test
steps:
  - action: click
    target:
      value: 'frameLocator(''iframe[name="app-frame"]'').getByRole(''button'', { name: ''Log in'' })'
      kind: locatorExpression
      source: codegen
`);

    expect(parsed).toHaveProperty("steps.0.target.value", "getByRole('button', { name: 'Log in' })");
    expect(parsed).toHaveProperty("steps.0.target.framePath", ['iframe[name="app-frame"]']);
    expect(parsed).toHaveProperty(
      "steps.0.target.raw",
      "frameLocator('iframe[name=\"app-frame\"]').getByRole('button', { name: 'Log in' })"
    );
  });

  it("normalizes inline contentFrame chains in YAML targets into framePath metadata", () => {
    const parsed = yamlToTest(`
name: Nested Frame Test
steps:
  - action: fill
    target:
      value: 'locator(''#outer'').contentFrame().locator(''iframe[name="inner"]'').contentFrame().getByLabel(''Email'')'
      kind: locatorExpression
      source: codegen
    text: "user@example.com"
`);

    expect(parsed).toHaveProperty("steps.0.target.value", "getByLabel('Email')");
    expect(parsed).toHaveProperty("steps.0.target.framePath", ["#outer", 'iframe[name="inner"]']);
    expect(parsed).toHaveProperty(
      "steps.0.target.raw",
      "locator('#outer').contentFrame().locator('iframe[name=\"inner\"]').contentFrame().getByLabel('Email')"
    );
  });
});
