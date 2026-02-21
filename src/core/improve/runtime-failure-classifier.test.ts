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

  it("classifies content interactions as retained non-transient failures", () => {
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

    expect(out.disposition).toBe("retain");
  });

  it("keeps generic business wording in transient context as retained", () => {
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

    expect(out.disposition).toBe("retain");
  });

  it("keeps privacy content-link interactions as retained", () => {
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

    expect(out.disposition).toBe("retain");
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
        key: "Enter",
      }
    );

    expect(out.disposition).toBe("remove");
  });

  // --- Multilingual cookie-consent pattern tests ---

  it("removes Dutch 'Akkoord' cookie-consent button via multilingual pattern", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Akkoord' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("removes German 'Akzeptieren' cookie-consent button via multilingual pattern", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Akzeptieren' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("removes French 'Tout accepter' cookie-consent button via multilingual pattern", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Tout accepter' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("removes Spanish 'Aceptar todo' cookie-consent button via multilingual pattern", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Aceptar todo' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("removes Dutch 'Alle cookies accepteren' button via multilingual pattern", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Alle cookies accepteren' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("removes interaction targeting a known CMP selector", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "#onetrust-accept-btn-handler",
        kind: "css",
        source: "manual",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("CMP selector");
  });

  it("removes interaction using multilingual dismiss intent (Dutch 'sluiten')", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Venster sluiten' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("transient");
  });

  it("does not remove non-consent button with similar-sounding name", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'Bestellen' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("retain");
  });

  it("handles case-insensitive matching for cookie consent text", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'AKKOORD' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
  });

  it("handles French J'accepte with apostrophe in double-quoted name", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: `getByRole('button', { name: "J'accepte" })`,
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    expect(out.disposition).toBe("remove");
    expect(out.reason).toContain("multilingual pattern match");
  });

  it("does not match CMP selectors against locator expression names", () => {
    const out = classifyRuntimeFailingStep({
      action: "click",
      target: {
        value: "getByRole('button', { name: 'cc-accept form' })",
        kind: "locatorExpression",
        source: "codegen-jsonl",
      },
    });

    // Should not be classified as CMP — the text happens to contain a CSS class name
    // but it's an accessible name in a locator expression, not a CSS selector
    expect(out.reason).not.toContain("CMP selector");
  });
});
