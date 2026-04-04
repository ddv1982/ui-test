import { describe, expect, it } from "vitest";
import { playwrightCodeToSteps } from "./playwright-ast-transform.js";

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

  it("normalizes frameLocator chains into framePath metadata", () => {
    const code = `
      import { test } from '@playwright/test';
      test('x', async ({ page }) => {
        await page.frameLocator('iframe[title="Checkout"]').getByRole('button', { name: 'Pay now' }).click();
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Pay now' })",
          kind: "locatorExpression",
          source: "codegen",
          framePath: ["iframe[title=\"Checkout\"]"],
          raw: "page.frameLocator('iframe[title=\"Checkout\"]').getByRole('button', { name: 'Pay now' })",
          confidence: 0.9,
        },
      },
    ]);
  });

  it("normalizes nested contentFrame chains into framePath metadata", () => {
    const code = `
      import { test } from '@playwright/test';
      test('x', async ({ page }) => {
        await page.locator('#outer').contentFrame().locator('iframe[name="inner"]').contentFrame().getByLabel('Email').fill('user@example.com');
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps).toEqual([
      {
        action: "fill",
        target: {
          value: "getByLabel('Email')",
          kind: "locatorExpression",
          source: "codegen",
          framePath: ["#outer", 'iframe[name="inner"]'],
          raw: "page.locator('#outer').contentFrame().locator('iframe[name=\"inner\"]').contentFrame().getByLabel('Email')",
          confidence: 0.8,
        },
        text: "user@example.com",
      },
    ]);
  });

  it("falls back to raw locator expressions when frame chains are not terminalized", () => {
    const code = `
      import { test } from '@playwright/test';
      test('x', async ({ page }) => {
        await page.frameLocator('iframe[name="app"]').click();
      });
    `;

    const steps = playwrightCodeToSteps(code);
    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "frameLocator('iframe[name=\"app\"]')",
          kind: "locatorExpression",
          source: "codegen",
          confidence: 0.5,
        },
      },
    ]);
  });
});
