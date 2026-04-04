import { describe, expect, it } from "vitest";
import {
  buildRoleTarget,
  buildTextTarget,
  extractActedTargetHint,
  isNoisyText,
  matchesActedTarget,
  nodeIdentityKey,
  nodeSignature,
  normalizeForCompare,
  stableStructuralRolePriority,
  textRolePriority,
  visibleRolePriority,
  type SnapshotNode,
} from "./assertion-candidates-snapshot-shared.js";

describe("assertion-candidates-snapshot-shared", () => {
  it("builds role targets with codegen source and frame path", () => {
    expect(
      buildRoleTarget("dialog", "Cookie preferences", ["iframe[name='consent']"])
    ).toEqual({
      value: "getByRole('dialog', { name: 'Cookie preferences' })",
      kind: "locatorExpression",
      source: "codegen",
      framePath: ["iframe[name='consent']"],
    });
  });

  it("builds text targets preferring role targets for visible named roles", () => {
    const roleNode: SnapshotNode = {
      role: "heading",
      name: "Welcome",
      visible: true,
      enabled: true,
      rawLine: '  - heading "Welcome"',
    };
    const textNode: SnapshotNode = {
      role: "text",
      text: "Saved successfully",
      visible: true,
      enabled: true,
      rawLine: "  - text: Saved successfully",
    };

    expect(buildTextTarget(roleNode, "Welcome", undefined).value).toBe(
      "getByRole('heading', { name: 'Welcome' })"
    );
    expect(buildTextTarget(textNode, "Saved successfully", undefined).value).toBe(
      "getByText('Saved successfully')"
    );
  });

  it("extracts acted target hints from multiple step types", () => {
    expect(extractActedTargetHint({ action: "navigate", url: "/dashboard" })).toBe(
      "/dashboard"
    );
    expect(extractActedTargetHint({ action: "assertTitle", title: "Dashboard" })).toBe(
      "Dashboard"
    );
    expect(
      extractActedTargetHint({
        action: "click",
        target: { value: "#submit", kind: "css", source: "manual" },
      })
    ).toBe("#submit");
  });

  it("normalizes text and matches acted-target hints loosely", () => {
    expect(normalizeForCompare("  Main   Menu ")).toBe("main menu");
    expect(matchesActedTarget("Main menu", "getByRole('navigation', { name: 'Main menu' })")).toBe(
      true
    );
    expect(matchesActedTarget("Checkout", "Privacy policy")).toBe(false);
  });

  it("derives stable node keys and detects noisy text", () => {
    const node: SnapshotNode = {
      role: "heading",
      name: "Welcome",
      text: "Welcome",
      ref: "e2",
      visible: true,
      enabled: true,
      rawLine: '  - heading "Welcome"',
    };

    expect(nodeSignature(node)).toBe("heading|welcome|welcome|v|e");
    expect(nodeIdentityKey(node)).toBe("ref:e2");
    expect(isNoisyText("12345")).toBe(true);
    expect(isNoisyText("https://example.com")).toBe(true);
    expect(isNoisyText("Saved")).toBe(false);
  });

  it("exposes stable priority ordering helpers", () => {
    expect(textRolePriority("heading")).toBeLessThan(textRolePriority("link"));
    expect(visibleRolePriority("heading")).toBeLessThan(visibleRolePriority("button"));
    expect(stableStructuralRolePriority("navigation")).toBeLessThan(
      stableStructuralRolePriority("contentinfo")
    );
  });
});
