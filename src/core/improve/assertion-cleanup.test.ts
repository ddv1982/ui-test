import { describe, expect, it } from "vitest";
import { findStaleAssertions, removeStaleAssertions } from "./assertion-cleanup.js";
import type { Step } from "../yaml-schema.js";

describe("assertion cleanup", () => {
  it("detects adjacent click -> same-target assertVisible", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
    ];

    const found = findStaleAssertions(steps);
    expect(found).toEqual([
      {
        index: 1,
        reason: "adjacent_click_press_same_target_assert_visible",
      },
    ]);
  });

  it("detects adjacent press -> same-target assertVisible", () => {
    const steps: Step[] = [
      {
        action: "press",
        target: { value: "#login", kind: "css", source: "manual" },
        key: "Enter",
      },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
    ];

    const found = findStaleAssertions(steps);
    expect(found).toHaveLength(1);
    expect(found[0]?.index).toBe(1);
  });

  it("does not match when target value differs", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#logout", kind: "css", source: "manual" } },
    ];

    expect(findStaleAssertions(steps)).toHaveLength(0);
  });

  it("matches semantically equivalent locator expressions with formatting differences", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: {
          value: "getByRole( 'button' , { name: \"Log in\" } )",
          kind: "locatorExpression",
          source: "manual",
        },
      },
      {
        action: "assertVisible",
        target: {
          value: "getByRole('button', { name: 'Log in' })",
          kind: "locatorExpression",
          source: "manual",
        },
      },
    ];

    const found = findStaleAssertions(steps);
    expect(found).toHaveLength(1);
    expect(found[0]?.index).toBe(1);
  });

  it("does not match when framePath differs", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: { value: "#login", kind: "css", source: "manual", framePath: ["frame-a"] },
      },
      {
        action: "assertVisible",
        target: { value: "#login", kind: "css", source: "manual", framePath: ["frame-b"] },
      },
    ];

    expect(findStaleAssertions(steps)).toHaveLength(0);
  });

  it("does not match non-adjacent assertions", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "hover", target: { value: "#menu", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
    ];

    expect(findStaleAssertions(steps)).toHaveLength(0);
  });

  it("removes stale assertions by index", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
    ];

    const cleaned = removeStaleAssertions(steps, [1]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned.some((step) => step.action === "assertVisible")).toBe(false);
  });
});
