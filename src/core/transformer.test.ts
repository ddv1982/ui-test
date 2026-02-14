import { describe, it, expect } from "vitest";
import {
  jsonlToSteps,
  jsonlToRecordingSteps,
  playwrightCodeToSteps,
  stepsToYaml,
  yamlToTest,
} from "./transformer.js";

describe("jsonlToSteps", () => {
  it("parses navigate", () => {
    const steps = jsonlToSteps('{"type":"navigate","url":"https://example.com"}');
    expect(steps).toEqual([{ action: "navigate", url: "https://example.com" }]);
  });

  it("parses selector actions into V2 target", () => {
    const steps = jsonlToSteps('{"type":"click","selector":"button"}');
    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "button",
          kind: "css",
          source: "codegen-jsonl",
          raw: "button",
          confidence: 0.4,
          warning: "Could not normalize selector from codegen locator chain; preserving raw selector.",
        },
      },
    ]);
  });

  it("uses locator chain normalization in reliable mode", () => {
    const steps = jsonlToSteps(
      '{"type":"click","selector":"button","locator":{"kind":"role","body":"button","options":{"name":"Save"}}}'
    );
    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Save' })",
          kind: "locatorExpression",
          source: "codegen-jsonl",
        },
      },
    ]);
  });

  it("falls back to raw selector when locator normalization is invalid", () => {
    const steps = jsonlToSteps(
      '{"type":"click","selector":"#submit","locator":{"kind":"nth","body":"not-a-number"}}'
    );

    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "#submit",
          kind: "css",
          source: "codegen-jsonl",
          raw: "#submit",
          confidence: 0.4,
          warning: "Could not normalize selector from codegen locator chain; preserving raw selector.",
        },
      },
    ]);
  });

  it("preserves raw selectors in raw policy", () => {
    const steps = jsonlToSteps('{"type":"click","selector":"text=Save"}', {
      selectorPolicy: "raw",
    });

    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "text=Save",
          kind: "playwrightSelector",
          source: "codegen-jsonl",
        },
      },
    ]);
  });

  it("includes framePath metadata when present", () => {
    const steps = jsonlToSteps(
      '{"type":"click","selector":"button","framePath":["iframe[name=\\"checkout\\"]"]}'
    );

    expect(steps).toEqual([
      {
        action: "click",
        target: {
          value: "button",
          kind: "css",
          source: "codegen-jsonl",
          framePath: ['iframe[name="checkout"]'],
          raw: "button",
          confidence: 0.4,
          warning: "Could not normalize selector from codegen locator chain; preserving raw selector.",
        },
      },
    ]);
  });

  it("parses openPage into navigate and skips about:blank", () => {
    const steps = jsonlToSteps(
      '{"name":"openPage","url":"about:blank"}\n{"name":"openPage","url":"https://example.com"}'
    );
    expect(steps).toEqual([{ action: "navigate", url: "https://example.com" }]);
  });

  it("skips malformed and unsupported lines", () => {
    const steps = jsonlToSteps(
      ['{"type":"unknown","selector":"button"}', 'not json', '{"type":"click","selector":"#x"}'].join("\n")
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ action: "click" });
  });

  it("builds defined steps for every supported selector action", () => {
    const lines = [
      '{"type":"click","selector":"#a"}',
      '{"type":"fill","selector":"#a","text":"hello"}',
      '{"type":"press","selector":"#a","key":"Enter"}',
      '{"type":"check","selector":"#a"}',
      '{"type":"uncheck","selector":"#a"}',
      '{"type":"hover","selector":"#a"}',
      '{"type":"select","selector":"#a","value":"v"}',
      '{"type":"assertVisible","selector":"#a"}',
      '{"type":"assertText","selector":"#a","text":"ok"}',
      '{"type":"assertValue","selector":"#a","value":"ok"}',
      '{"type":"assertChecked","selector":"#a"}',
    ];

    const steps = jsonlToSteps(lines.join("\n"));
    expect(steps).toHaveLength(lines.length);
    expect(steps.map((step) => step.action)).toEqual([
      "click",
      "fill",
      "press",
      "check",
      "uncheck",
      "hover",
      "select",
      "assertVisible",
      "assertText",
      "assertValue",
      "assertChecked",
    ]);
  });
});

describe("jsonlToRecordingSteps", () => {
  it("returns selector quality stats", () => {
    const out = jsonlToRecordingSteps(
      [
        '{"type":"navigate","url":"/"}',
        '{"type":"click","selector":"#a"}',
        '{"type":"click","selector":"#b","locator":{"kind":"role","body":"button"}}',
      ].join("\n")
    );

    expect(out.steps).toHaveLength(3);
    expect(out.stats.selectorSteps).toBe(2);
    expect(out.stats.stableSelectors).toBe(1);
    expect(out.stats.fallbackSelectors).toBe(1);
  });

  it("ignores unsupported actions without affecting selector stats", () => {
    const out = jsonlToRecordingSteps(
      [
        '{"type":"noop","selector":"#ignored","locator":{"kind":"nth","body":"not-a-number"}}',
        '{"name":"noop","selector":"#also-ignored"}',
        '{"type":"navigate","url":"/"}',
      ].join("\n")
    );

    expect(out.steps).toEqual([{ action: "navigate", url: "/" }]);
    expect(out.stats.selectorSteps).toBe(0);
    expect(out.stats.stableSelectors).toBe(0);
    expect(out.stats.fallbackSelectors).toBe(0);
    expect(out.stats.frameAwareSelectors).toBe(0);
  });
});

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
          source: "codegen-fallback",
        },
      },
      {
        action: "assertText",
        target: {
          value: "locator('#status')",
          kind: "locatorExpression",
          source: "codegen-fallback",
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
});
