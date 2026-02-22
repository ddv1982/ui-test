import { describe, it, expect } from "vitest";
import { devtoolsRecordingToSteps } from "./devtools-recording-adapter.js";

describe("devtoolsRecordingToSteps", () => {
  it("converts navigate step", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      title: "Test",
      steps: [{ type: "navigate", url: "https://example.com" }],
    }));

    expect(result.steps).toEqual([
      { action: "navigate", url: "https://example.com" },
    ]);
    expect(result.title).toBe("Test");
  });

  it("converts click step with ARIA selector", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["aria/Submit[role=\"button\"]"]],
      }],
    }));

    expect(result.steps).toEqual([{
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Submit' })",
        kind: "locatorExpression",
        source: "devtools-import",
        confidence: expect.any(Number),
      },
    }]);
  });

  it("converts change step to fill", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "change",
        selectors: [["#email"]],
        value: "user@example.com",
      }],
    }));

    expect(result.steps).toEqual([{
      action: "fill",
      target: {
        value: "#email",
        kind: "css",
        source: "devtools-import",
        confidence: 0.5,
      },
      text: "user@example.com",
    }]);
  });

  it("merges keyDown + keyUp into press", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [
        { type: "keyDown", key: "Enter", selectors: [["#input"]] },
        { type: "keyUp", key: "Enter" },
      ],
    }));

    expect(result.steps).toEqual([{
      action: "press",
      target: {
        value: "#input",
        kind: "css",
        source: "devtools-import",
        confidence: 0.5,
      },
      key: "Enter",
    }]);
  });

  it("skips keyDown without matching keyUp", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [
        { type: "keyDown", key: "Enter", selectors: [["#input"]] },
      ],
    }));

    expect(result.steps).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("converts waitForElement to assertVisible", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "waitForElement",
        selectors: [["aria/Success message"]],
      }],
    }));

    expect(result.steps).toEqual([{
      action: "assertVisible",
      target: {
        value: "getByLabel('Success message')",
        kind: "locatorExpression",
        source: "devtools-import",
        confidence: expect.any(Number),
      },
    }]);
  });

  it("converts doubleClick step to dblclick", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "doubleClick",
        selectors: [["aria/Edit[role=\"button\"]"]],
      }],
    }));

    expect(result.steps).toEqual([{
      action: "dblclick",
      target: {
        value: "getByRole('button', { name: 'Edit' })",
        kind: "locatorExpression",
        source: "devtools-import",
        confidence: expect.any(Number),
      },
    }]);
  });

  it("converts hover step", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "hover",
        selectors: [["aria/Menu[role=\"button\"]"]],
      }],
    }));

    expect(result.steps).toEqual([{
      action: "hover",
      target: {
        value: "getByRole('button', { name: 'Menu' })",
        kind: "locatorExpression",
        source: "devtools-import",
        confidence: expect.any(Number),
      },
    }]);
  });

  it("skips scroll, setViewport, and close steps", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [
        { type: "scroll", x: 0, y: 100 },
        { type: "setViewport", width: 1920, height: 1080 },
        { type: "close" },
      ],
    }));

    expect(result.steps).toEqual([]);
    expect(result.skipped).toBe(3);
  });

  it("prefers ARIA selector over CSS", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [
          ["#btn-submit"],
          ["aria/Save[role=\"button\"]"],
        ],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByRole('button', { name: 'Save' })",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
  });

  it("prefers data-testid selector when no ARIA available", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [
          ["[data-testid=\"save-btn\"]"],
          ["div > button.primary"],
        ],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByTestId('save-btn')",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
  });

  it("falls back to CSS selector", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["div > button.primary"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        kind: "css",
        source: "devtools-import",
        confidence: 0.5,
      },
    });
  });

  it("falls back to XPath selector as last resort", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["xpath//html/body/button"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "/html/body/button",
        kind: "xpath",
        source: "devtools-import",
        confidence: 0.3,
      },
    });
  });

  it("returns empty steps for malformed JSON", () => {
    const result = devtoolsRecordingToSteps("not valid json");
    expect(result.steps).toEqual([]);
  });

  it("returns empty steps for missing steps array", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({ title: "Empty" }));
    expect(result.steps).toEqual([]);
  });

  it("handles complete recording flow", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      title: "Login Flow",
      steps: [
        { type: "navigate", url: "https://example.com/login" },
        { type: "click", selectors: [["aria/Email[role=\"textbox\"]"]] },
        { type: "change", selectors: [["#email"]], value: "user@example.com" },
        { type: "change", selectors: [["#password"]], value: "secret" },
        { type: "click", selectors: [["aria/Login[role=\"button\"]"]] },
        { type: "waitForElement", selectors: [["aria/Dashboard"]] },
      ],
    }));

    expect(result.title).toBe("Login Flow");
    expect(result.steps).toHaveLength(6);
    expect(result.steps.map((s) => s.action)).toEqual([
      "navigate", "click", "fill", "fill", "click", "assertVisible",
    ]);
  });

  it("skips click steps without selectors", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{ type: "click" }],
    }));

    expect(result.steps).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("escapes backslashes in ARIA selector names", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["aria/it\\s a \\path[role=\"button\"]"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByRole('button', { name: 'it\\\\s a \\\\path' })",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
  });

  it("handles multi-segment shadow DOM ARIA selectors", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["aria/Submit[role=\"button\"]", "aria/Confirm[role=\"button\"]"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByRole('button', { name: 'Confirm' })",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
    // Multi-segment gets a reduced confidence
    expect((result.steps[0] as any).target.confidence).toBeLessThan(0.9);
  });

  it("handles ARIA selector with extra attributes beyond role", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["aria/Accept[role=\"button\"][checked=\"true\"]"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByRole('button', { name: 'Accept' })",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
  });

  it("handles ARIA selector without role attribute", () => {
    const result = devtoolsRecordingToSteps(JSON.stringify({
      steps: [{
        type: "click",
        selectors: [["aria/Email address"]],
      }],
    }));

    expect(result.steps[0]).toMatchObject({
      target: {
        value: "getByLabel('Email address')",
        kind: "locatorExpression",
        source: "devtools-import",
      },
    });
  });
});
