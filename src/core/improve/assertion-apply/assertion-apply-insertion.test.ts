import { describe, expect, it } from "vitest";
import type { Step } from "../../yaml-schema.js";
import {
  insertAppliedAssertions,
  isDuplicateAdjacentAssertion,
  isDuplicateSourceOrAdjacentAssertion,
} from "./assertion-apply-insertion.js";

function cssTarget(value: string, framePath?: string[]) {
  return {
    value,
    kind: "css" as const,
    source: "manual" as const,
    ...(framePath ? { framePath } : {}),
  };
}

describe("assertion-apply-insertion", () => {
  it("returns a shallow copy when there are no applied assertions", () => {
    const steps: Step[] = [
      { action: "navigate", url: "https://example.com" },
      { action: "click", target: cssTarget("#save") },
    ];

    const out = insertAppliedAssertions(steps, []);

    expect(out).toEqual(steps);
    expect(out).not.toBe(steps);
  });

  it("sorts insertions by source index before applying offsets", () => {
    const steps: Step[] = [
      { action: "click", target: cssTarget("#one") },
      { action: "fill", target: cssTarget("#two"), text: "Alice" },
      { action: "check", target: cssTarget("#three") },
    ];

    const out = insertAppliedAssertions(steps, [
      {
        sourceIndex: 2,
        assertionStep: { action: "assertVisible", target: cssTarget("#three") },
      },
      {
        sourceIndex: 0,
        assertionStep: { action: "assertVisible", target: cssTarget("#one") },
      },
    ]);

    expect(out.map((step) => step.action)).toEqual([
      "click",
      "assertVisible",
      "fill",
      "check",
      "assertVisible",
    ]);
  });

  it("detects duplicate source assertions before checking the adjacent step", () => {
    const steps: Step[] = [
      { action: "assertUrl", url: "https://example.com/dashboard" },
      { action: "click", target: cssTarget("#save") },
      { action: "assertUrl", url: "https://example.com/settings" },
    ];

    expect(
      isDuplicateSourceOrAdjacentAssertion(steps, 0, {
        action: "assertUrl",
        url: "https://example.com/dashboard",
      })
    ).toBe(true);
  });

  it("returns false when neither source nor adjacent assertion matches", () => {
    const steps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertTitle", title: "Dashboard" },
    ];

    expect(
      isDuplicateSourceOrAdjacentAssertion(steps, 0, {
        action: "assertUrl",
        url: "https://example.com/dashboard",
      })
    ).toBe(false);
  });

  it("treats assertText steps with the same text and target as duplicates", () => {
    const steps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      {
        action: "assertText",
        target: cssTarget("#status", ["iframe#app"]),
        text: "Saved",
      },
    ];

    expect(
      isDuplicateAdjacentAssertion(steps, 0, {
        action: "assertText",
        target: cssTarget("#status", ["iframe#app"]),
        text: "Saved",
      })
    ).toBe(true);
  });

  it("does not treat assertText steps with different text as duplicates", () => {
    const steps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertText", target: cssTarget("#status"), text: "Saved" },
    ];

    expect(
      isDuplicateAdjacentAssertion(steps, 0, {
        action: "assertText",
        target: cssTarget("#status"),
        text: "Saving",
      })
    ).toBe(false);
  });

  it("uses default true values when comparing assertChecked and assertEnabled steps", () => {
    const checkedSteps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertChecked", target: cssTarget("#agree") },
    ];
    const enabledSteps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertEnabled", target: cssTarget("#submit") },
    ];

    expect(
      isDuplicateAdjacentAssertion(checkedSteps, 0, {
        action: "assertChecked",
        target: cssTarget("#agree"),
        checked: true,
      })
    ).toBe(true);
    expect(
      isDuplicateAdjacentAssertion(enabledSteps, 0, {
        action: "assertEnabled",
        target: cssTarget("#submit"),
        enabled: true,
      })
    ).toBe(true);
  });

  it("distinguishes assertChecked and assertEnabled steps when boolean values differ", () => {
    const checkedSteps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertChecked", target: cssTarget("#agree"), checked: false },
    ];
    const enabledSteps: Step[] = [
      { action: "click", target: cssTarget("#save") },
      { action: "assertEnabled", target: cssTarget("#submit"), enabled: false },
    ];

    expect(
      isDuplicateAdjacentAssertion(checkedSteps, 0, {
        action: "assertChecked",
        target: cssTarget("#agree"),
        checked: true,
      })
    ).toBe(false);
    expect(
      isDuplicateAdjacentAssertion(enabledSteps, 0, {
        action: "assertEnabled",
        target: cssTarget("#submit"),
        enabled: true,
      })
    ).toBe(false);
  });

  it("treats assertValue steps with the same value and target as duplicates", () => {
    const steps: Step[] = [
      { action: "fill", target: cssTarget("#name"), text: "Alice" },
      { action: "assertValue", target: cssTarget("#name"), value: "Alice" },
    ];

    expect(
      isDuplicateAdjacentAssertion(steps, 0, {
        action: "assertValue",
        target: cssTarget("#name"),
        value: "Alice",
      })
    ).toBe(true);
  });

  it("compares assertTitle assertions by title", () => {
    const matchingSteps: Step[] = [
      { action: "navigate", url: "https://example.com" },
      { action: "assertTitle", title: "Dashboard" },
    ];
    const differentSteps: Step[] = [
      { action: "navigate", url: "https://example.com" },
      { action: "assertTitle", title: "Settings" },
    ];

    expect(
      isDuplicateAdjacentAssertion(matchingSteps, 0, {
        action: "assertTitle",
        title: "Dashboard",
      })
    ).toBe(true);
    expect(
      isDuplicateAdjacentAssertion(differentSteps, 0, {
        action: "assertTitle",
        title: "Dashboard",
      })
    ).toBe(false);
  });

  it("returns false when there is no adjacent assertion", () => {
    const steps: Step[] = [{ action: "click", target: cssTarget("#save") }];

    expect(
      isDuplicateAdjacentAssertion(steps, 0, {
        action: "assertVisible",
        target: cssTarget("#save"),
      })
    ).toBe(false);
  });
});
