import { describe, expect, it } from "vitest";
import { stepDescription } from "./step-description.js";
import type { Step, Target } from "../yaml-schema.js";

function makeTarget(value: string, kind: Target["kind"] = "css"): Target {
  return {
    value,
    kind,
    source: "manual",
  };
}

describe("stepDescription", () => {
  it("formats navigate step", () => {
    const step: Step = { action: "navigate", url: "https://example.com" };
    expect(stepDescription(step, 0)).toBe("Step 1: navigate to https://example.com");
  });

  it("formats click step with css target", () => {
    const step: Step = { action: "click", target: makeTarget("button") };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'button'");
  });

  it("includes description", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("#submit"),
      description: "Submit form",
    };
    expect(stepDescription(step, 1)).toBe("Step 2: click '#submit' - Submit form");
  });

  it("formats fill step with target and text", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget("getByLabel('Email')", "locatorExpression"),
      text: "user@example.com",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: fill \'Email\' → "user@example.com"');
  });

  it("formats press step with key", () => {
    const step: Step = {
      action: "press",
      target: makeTarget("getByRole('textbox')", "locatorExpression"),
      key: "Enter",
    };
    expect(stepDescription(step, 0)).toBe("Step 1: press 'Enter'");
  });

  it("formats assertVisible step with target", () => {
    const step: Step = {
      action: "assertVisible",
      target: makeTarget("#app"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: assertVisible '#app'");
  });

  it("formats assertText step with target and text", () => {
    const step: Step = {
      action: "assertText",
      target: makeTarget("getByRole('heading')", "locatorExpression"),
      text: "Welcome",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: assertText \'heading\' → "Welcome"');
  });

  it("formats assertValue step with target and value", () => {
    const step: Step = {
      action: "assertValue",
      target: makeTarget("getByLabel('Email')", "locatorExpression"),
      value: "user@example.com",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: assertValue \'Email\' → "user@example.com"');
  });

  it("formats assertChecked step with target", () => {
    const step: Step = {
      action: "assertChecked",
      target: makeTarget("getByRole('checkbox', { name: 'Remember me' })", "locatorExpression"),
      checked: true,
    };
    expect(stepDescription(step, 0)).toBe("Step 1: assertChecked 'Remember me'");
  });

  it("extracts name from locatorExpression with name arg", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("getByRole('button', { name: 'Sign in' })", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'Sign in'");
  });

  it("extracts name arg with embedded apostrophe", () => {
    const step: Step = {
      action: "click",
      target: makeTarget('getByRole("button", { name: "Bob\'s House" })', "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'Bob's House'");
  });

  it("extracts escaped quote in name arg", () => {
    const step: Step = {
      action: "click",
      target: makeTarget('getByRole("button", { name: "Say \\"hi\\"" })', "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe('Step 1: click \'Say "hi"\'');
  });

  it("truncates long target values", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("div.very-long-selector-name-that-exceeds-limit"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'div.very-long-selector-name...'");
  });

  it("formats select step with target and value", () => {
    const step: Step = {
      action: "select",
      target: makeTarget("getByLabel('Country')", "locatorExpression"),
      value: "US",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: select \'Country\' → "US"');
  });

  it("formats hover step with target", () => {
    const step: Step = { action: "hover", target: makeTarget("#menu-item") };
    expect(stepDescription(step, 0)).toBe("Step 1: hover '#menu-item'");
  });

  it("formats check step with target", () => {
    const step: Step = {
      action: "check",
      target: makeTarget("getByLabel('Terms')", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: check 'Terms'");
  });

  it("formats uncheck step with target", () => {
    const step: Step = {
      action: "uncheck",
      target: makeTarget("getByLabel('Newsletter')", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: uncheck 'Newsletter'");
  });

  it("handles locator expressions with embedded quotes", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("getByText(\"it's here\")", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'it's here'");
  });

  it("does not treat quoted literal text as name option", () => {
    const step: Step = {
      action: "click",
      target: makeTarget("getByText('name: \"foo\"')", "locatorExpression"),
    };
    expect(stepDescription(step, 0)).toBe("Step 1: click 'name: \"foo\"'");
  });

  it("truncates long fill text", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget("input"),
      text: "a-very-long-text-value-that-exceeds-the-limit",
    };
    expect(stepDescription(step, 0)).toBe('Step 1: fill \'input\' → "a-very-long-text-..."');
  });

  it("masks fill value for password fields", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget('input[name="user_password"]'),
      text: "s3cret!",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: fill \'input[name="user_password"]\' → "••••"'
    );
  });

  it("masks assertValue for password fields", () => {
    const step: Step = {
      action: "assertValue",
      target: makeTarget('input[name="password"]'),
      value: "s3cret!",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: assertValue \'input[name="password"]\' → "••••"'
    );
  });

  it("does not mask assertText for sensitive-looking targets", () => {
    const step: Step = {
      action: "assertText",
      target: makeTarget("#password-status"),
      text: "Password updated",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: assertText \'#password-status\' → "Password updated"'
    );
  });

  it("masks fill value for credential fields", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget('input[name="USER_CREDENTIAL"]'),
      text: "admin",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: fill \'input[name="USER_CREDENTIAL"]\' → "••••"'
    );
  });

  it("masks fill value for secret/token fields", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget('input[name="api_key"]'),
      text: "abc123",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: fill \'input[name="api_key"]\' → "••••"'
    );
  });

  it("does not mask non-sensitive fill fields", () => {
    const step: Step = {
      action: "fill",
      target: makeTarget('input[name="email"]'),
      text: "user@example.com",
    };
    expect(stepDescription(step, 0)).toBe(
      'Step 1: fill \'input[name="email"]\' → "user@example.com"'
    );
  });
});
