import { describe, expect, it } from "vitest";
import { findStaleAssertions, removeStaleAssertions } from "./assertion-cleanup.js";
import type { Step } from "../yaml-schema.js";

describe("assertion cleanup", () => {
  it("does not treat adjacent click/press visibility checks as stale", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
      {
        action: "press",
        target: { value: "#login", kind: "css", source: "manual" },
        key: "Enter",
      },
      { action: "assertVisible", target: { value: "#login", kind: "css", source: "manual" } },
    ];

    expect(findStaleAssertions(steps)).toEqual([]);
  });

  it("returns no stale findings for differing targets", () => {
    const steps: Step[] = [
      { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
      { action: "assertVisible", target: { value: "#logout", kind: "css", source: "manual" } },
    ];

    expect(findStaleAssertions(steps)).toHaveLength(0);
  });

  it("returns no stale findings for semantically equivalent locator formatting", () => {
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

    expect(findStaleAssertions(steps)).toHaveLength(0);
  });

  it("returns no stale findings when framePath differs", () => {
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

  it("returns no stale findings for non-adjacent assertions", () => {
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
