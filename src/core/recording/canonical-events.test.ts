import { describe, expect, it } from "vitest";
import { playwrightCodeToSteps } from "../transform/playwright-ast-transform.js";
import { devtoolsRecordingToSteps } from "../transform/devtools-recording-adapter.js";
import { canonicalEventsToSteps, stepsToCanonicalEvents } from "./canonical-events.js";
import type { Step } from "../yaml-schema.js";

describe("canonical events", () => {
  it("round-trips steps deterministically", () => {
    const steps = [
      { action: "navigate", url: "/" },
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Submit' })",
          kind: "locatorExpression",
          source: "manual",
          confidence: 0.91,
        },
      },
      {
        action: "fill",
        target: { value: "#email", kind: "css", source: "manual" },
        text: "user@example.com",
      },
    ] as const;

    const canonical = stepsToCanonicalEvents([...steps]);
    const rebuilt = canonicalEventsToSteps(canonical);
    const canonicalAgain = stepsToCanonicalEvents(rebuilt);

    expect(canonicalAgain).toEqual(canonical);
    expect(rebuilt).toEqual(steps);
  });

  it("normalizes adapter outputs through the same canonical action contract", () => {
    const playwrightCode = [
      "import { test, expect } from '@playwright/test';",
      "test('recording', async ({ page }) => {",
      "  await page.goto('/');",
      "  await page.getByRole('button', { name: 'Submit' }).click();",
      "  await page.locator('#email').fill('user@example.com');",
      "});",
    ].join("\n");

    const devtoolsRecording = JSON.stringify({
      title: "recording",
      steps: [
        { type: "navigate", url: "/" },
        { type: "click", selectors: [["aria/Submit[role=\"button\"]"]] },
        { type: "change", selectors: [["#email"]], value: "user@example.com" },
      ],
    });

    const playwrightKinds = stepsToCanonicalEvents(playwrightCodeToSteps(playwrightCode)).map(
      (event) => event.kind
    );
    const devtoolsKinds = stepsToCanonicalEvents(devtoolsRecordingToSteps(devtoolsRecording).steps).map(
      (event) => event.kind
    );

    expect(playwrightKinds).toEqual(["navigate", "click", "fill"]);
    expect(devtoolsKinds).toEqual(["navigate", "click", "fill"]);
  });

  it("preserves selector provenance through canonical round-trips", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Continue' })",
          kind: "locatorExpression",
          source: "codegen",
          raw: "page.getByRole('button', { name: 'Continue' })",
          framePath: ["iframe[name='checkout']"],
          confidence: 0.9,
          warning: "preferred locator",
          fallbacks: [{ value: "#continue", kind: "css", source: "codegen" }],
        },
      },
    ];

    const rebuilt = canonicalEventsToSteps(stepsToCanonicalEvents([...steps]));

    expect(rebuilt).toEqual(steps);
  });

  it("preserves normalized navigation context through canonical round-trips", () => {
    const steps: Step[] = [
      { action: "navigate", url: "/start?next=%2Fcheckout#summary" },
      {
        action: "click",
        target: {
          value: "#continue",
          kind: "css",
          source: "manual",
        },
      },
    ];

    const rebuilt = canonicalEventsToSteps(stepsToCanonicalEvents(steps));

    expect(rebuilt).toEqual(steps);
  });

  it("canonicalizes specialized step actions and clones selector metadata", () => {
    const steps: Step[] = [
      {
        action: "dblclick",
        description: "Double open item",
        timeout: 1250,
        target: {
          value: "#item",
          kind: "css",
          source: "manual",
          framePath: ["iframe[name='items']"],
          raw: "page.locator('#item')",
          confidence: 0.5,
          warning: "fallback needed",
          fallbacks: [{ value: "[data-testid='item']", kind: "css", source: "codegen" }],
        },
      },
      {
        action: "hover",
        target: { value: "#menu", kind: "css", source: "manual" },
      },
      {
        action: "check",
        target: { value: "#tos", kind: "css", source: "manual" },
      },
      {
        action: "uncheck",
        target: { value: "#newsletter", kind: "css", source: "manual" },
      },
      {
        action: "press",
        target: { value: "#search", kind: "css", source: "manual" },
        key: "Enter",
      },
      {
        action: "select",
        target: { value: "#country", kind: "css", source: "manual" },
        value: "US",
      },
      {
        action: "assertVisible",
        target: { value: "#summary", kind: "css", source: "manual" },
      },
      {
        action: "assertText",
        target: { value: "h1", kind: "css", source: "manual" },
        text: "Review order",
      },
      {
        action: "assertValue",
        target: { value: "#promo", kind: "css", source: "manual" },
        value: "SAVE10",
      },
      {
        action: "assertChecked",
        target: { value: "#tos", kind: "css", source: "manual" },
        checked: false,
      },
      { action: "assertUrl", url: "/checkout" },
      { action: "assertTitle", title: "Checkout" },
      {
        action: "assertEnabled",
        target: { value: "#submit", kind: "css", source: "manual" },
        enabled: false,
      },
    ];

    const canonical = stepsToCanonicalEvents(steps);

    expect(canonical).toEqual([
      {
        kind: "dblclick",
        description: "Double open item",
        timeout: 1250,
        target: {
          value: "#item",
          kind: "css",
          source: "manual",
          framePath: ["iframe[name='items']"],
          raw: "page.locator('#item')",
          confidence: 0.5,
          warning: "fallback needed",
          fallbacks: [{ value: "[data-testid='item']", kind: "css", source: "codegen" }],
        },
      },
      { kind: "hover", target: { value: "#menu", kind: "css", source: "manual" } },
      { kind: "check", target: { value: "#tos", kind: "css", source: "manual" } },
      { kind: "uncheck", target: { value: "#newsletter", kind: "css", source: "manual" } },
      {
        kind: "press",
        target: { value: "#search", kind: "css", source: "manual" },
        key: "Enter",
      },
      {
        kind: "select",
        target: { value: "#country", kind: "css", source: "manual" },
        value: "US",
      },
      { kind: "assertVisible", target: { value: "#summary", kind: "css", source: "manual" } },
      {
        kind: "assertText",
        target: { value: "h1", kind: "css", source: "manual" },
        text: "Review order",
      },
      {
        kind: "assertValue",
        target: { value: "#promo", kind: "css", source: "manual" },
        value: "SAVE10",
      },
      {
        kind: "assertChecked",
        target: { value: "#tos", kind: "css", source: "manual" },
        checked: false,
      },
      { kind: "assertUrl", url: "/checkout" },
      { kind: "assertTitle", title: "Checkout" },
      {
        kind: "assertEnabled",
        target: { value: "#submit", kind: "css", source: "manual" },
        enabled: false,
      },
    ]);

    const firstTargetStep = steps[0] as Extract<Step, { target: unknown }>;
    firstTargetStep.target.framePath?.push("iframe[name='detail']");
    firstTargetStep.target.fallbacks?.push({ value: "[data-testid='item']", kind: "css", source: "manual" });

    expect(canonical[0]).toEqual({
      kind: "dblclick",
      description: "Double open item",
      timeout: 1250,
      target: {
        value: "#item",
        kind: "css",
        source: "manual",
        framePath: ["iframe[name='items']"],
        raw: "page.locator('#item')",
        confidence: 0.5,
        warning: "fallback needed",
        fallbacks: [{ value: "[data-testid='item']", kind: "css", source: "codegen" }],
      },
    });
  });

  it("rebuilds canonical events with defaults for missing fields and unknown kinds", () => {
    const rebuilt = canonicalEventsToSteps([
      { kind: "navigate" },
      { kind: "click", description: "click fallback", timeout: 250 },
      { kind: "fill" },
      { kind: "press" },
      { kind: "select" },
      { kind: "assertText" },
      { kind: "assertValue" },
      { kind: "assertChecked" },
      { kind: "assertUrl" },
      { kind: "assertTitle" },
      { kind: "assertEnabled" },
      { kind: "unknown" as Step["action"] },
    ]);

    expect(rebuilt).toEqual([
      { action: "navigate", url: "/" },
      {
        action: "click",
        description: "click fallback",
        timeout: 250,
        target: { value: "*", kind: "unknown", source: "manual" },
      },
      {
        action: "fill",
        target: { value: "*", kind: "unknown", source: "manual" },
        text: "",
      },
      {
        action: "press",
        target: { value: "*", kind: "unknown", source: "manual" },
        key: "",
      },
      {
        action: "select",
        target: { value: "*", kind: "unknown", source: "manual" },
        value: "",
      },
      {
        action: "assertText",
        target: { value: "*", kind: "unknown", source: "manual" },
        text: "",
      },
      {
        action: "assertValue",
        target: { value: "*", kind: "unknown", source: "manual" },
        value: "",
      },
      {
        action: "assertChecked",
        target: { value: "*", kind: "unknown", source: "manual" },
        checked: true,
      },
      { action: "assertUrl", url: "" },
      { action: "assertTitle", title: "" },
      {
        action: "assertEnabled",
        target: { value: "*", kind: "unknown", source: "manual" },
        enabled: true,
      },
      { action: "navigate", url: "/" },
    ]);
  });
});
