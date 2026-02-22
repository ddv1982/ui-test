import { describe, it, expect } from "vitest";
import { playwrightCodeToSteps } from "./transform/playwright-ast-transform.js";
import { stepsToYaml, yamlToTest } from "./transform/yaml-io.js";

describe("playwrightCodeToSteps", () => {
  it("parses playwright-test code into V2 target steps", () => {
    const code = `
      import { test, expect } from '@playwright/test';
      test('x', async ({ page }) => {
        await page.goto('https://example.com');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.locator('#status')).toContainText('Done');
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps).toEqual([
      { action: "navigate", url: "https://example.com" },
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Save' })",
          kind: "locatorExpression",
          source: "codegen",
          confidence: 0.9,
        },
      },
      {
        action: "assertText",
        target: {
          value: "locator('#status')",
          kind: "locatorExpression",
          source: "codegen",
          confidence: 0.5,
        },
        text: "Done",
      },
    ]);
  });

  it("returns empty list for non-parseable code", () => {
    expect(playwrightCodeToSteps("this is not js")).toEqual([]);
  });

  it("ignores awaited calls outside test callback bodies", () => {
    const code = `
      import { test } from '@playwright/test';
      async function helper(page) {
        await page.goto('https://should-not-be-recorded.example');
      }
      test('x', async ({ page }) => {
        await page.goto('https://example.com');
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps).toEqual([{ action: "navigate", url: "https://example.com" }]);
  });

  it("parses fill, press, check, uncheck, hover, selectOption actions", () => {
    const code = `
      import { test } from '@playwright/test';
      test('x', async ({ page }) => {
        await page.getByLabel('Email').fill('user@example.com');
        await page.getByLabel('Email').press('Enter');
        await page.getByRole('checkbox').check();
        await page.getByRole('checkbox').uncheck();
        await page.getByText('Menu').hover();
        await page.getByRole('combobox').selectOption('us');
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps.map((s) => s.action)).toEqual([
      "fill", "press", "check", "uncheck", "hover", "select",
    ]);
  });

  it("parses expect assertions", () => {
    const code = `
      import { test, expect } from '@playwright/test';
      test('x', async ({ page }) => {
        await expect(page.getByRole('heading')).toBeVisible();
        await expect(page.getByRole('heading')).toHaveText('Welcome');
        await expect(page.locator('#input')).toHaveValue('test');
        await expect(page.getByRole('checkbox')).toBeChecked();
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps.map((s) => s.action)).toEqual([
      "assertVisible", "assertText", "assertValue", "assertChecked",
    ]);
  });
});

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
