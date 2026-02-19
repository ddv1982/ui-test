import { describe, expect, it } from "vitest";
import { classifyRuntimeFailingStep } from "./runtime-failure-classifier.js";

describe("classifyRuntimeFailingStep", () => {
  it("classifies cookie-dismiss interactions as transient removals", () => {
    const out = classifyRuntimeFailingStep(
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Accept cookies' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }
    );

    expect(out.disposition).toBe("remove");
  });

  it("classifies content interactions as optionalized non-transient failures", () => {
    const out = classifyRuntimeFailingStep(
      {
        action: "click",
        target: {
          value: "getByRole('link', { name: 'Olympische Spelen' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }
    );

    expect(out.disposition).toBe("optionalize");
  });

  it("keeps generic business wording in transient context as optionalized", () => {
    const out = classifyRuntimeFailingStep(
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Accept payment privacy settings' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }
    );

    expect(out.disposition).toBe("optionalize");
  });

  it("keeps privacy content-link interactions as optionalized", () => {
    const out = classifyRuntimeFailingStep(
      {
        action: "click",
        target: {
          value: "getByRole('link', { name: 'Privacy policy' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }
    );

    expect(out.disposition).toBe("optionalize");
  });

  it("still removes strong transient button interactions", () => {
    const out = classifyRuntimeFailingStep(
      {
        action: "press",
        target: {
          value: "getByRole('button', { name: 'Accept privacy preferences' })",
          kind: "locatorExpression",
          source: "manual",
        },
      }
    );

    expect(out.disposition).toBe("remove");
  });
});
