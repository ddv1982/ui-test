import { describe, expect, it, vi } from "vitest";
import { generateAriaTargetCandidates } from "./candidate-generator-aria.js";
import type { Target } from "../yaml-schema.js";

function mockPage(
  snapshotYaml: string,
  options?: {
    placeholder?: string;
    evaluateResult?: Record<string, unknown>;
  }
) {
  const locator = {
    ariaSnapshot: vi.fn().mockResolvedValue(snapshotYaml),
    getAttribute: vi.fn().mockResolvedValue(options?.placeholder ?? null),
    evaluate: vi.fn().mockResolvedValue(options?.evaluateResult ?? {}),
  };
  return {
    page: {
      locator: vi.fn().mockReturnValue(locator),
      getByRole: vi.fn().mockReturnValue(locator),
      getByTestId: vi.fn().mockReturnValue(locator),
      getByText: vi.fn().mockReturnValue(locator),
      getByLabel: vi.fn().mockReturnValue(locator),
      getByPlaceholder: vi.fn().mockReturnValue(locator),
      getByTitle: vi.fn().mockReturnValue(locator),
      frameLocator: vi.fn().mockReturnValue({
        locator: vi.fn().mockReturnValue(locator),
      }),
    } as any,
    locator,
  };
}

describe("generateAriaTargetCandidates", () => {
  const cssTarget: Target = { value: "#email", kind: "css", source: "manual" };

  it("generates getByRole candidate from textbox with name", async () => {
    const { page, locator } = mockPage('- textbox "Email"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    const roleCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_role_name"));
    expect(roleCandidate).toBeDefined();
    expect(roleCandidate!.target.value).toBe("getByRole('textbox', { name: 'Email' })");
    expect(roleCandidate!.target.kind).toBe("locatorExpression");
    expect(roleCandidate!.source).toBe("derived");
    expect(locator.evaluate).not.toHaveBeenCalled();
  });

  it("generates getByLabel candidate for form control roles", async () => {
    const { page } = mockPage('- textbox "Email"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const labelCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_label"));
    expect(labelCandidate).toBeDefined();
    expect(labelCandidate!.target.value).toBe("getByLabel('Email')");
  });

  it("generates getByPlaceholder candidate when placeholder attribute exists", async () => {
    const { page } = mockPage('- textbox "Email"', { placeholder: "Enter your email" });
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const placeholderCandidate = result.candidates.find((c) =>
      c.reasonCodes.includes("aria_placeholder")
    );
    expect(placeholderCandidate).toBeDefined();
    expect(placeholderCandidate!.target.value).toBe("getByPlaceholder('Enter your email')");
  });

  it("generates getByText candidate for text roles like heading", async () => {
    const target: Target = { value: ".title", kind: "css", source: "manual" };
    const { page } = mockPage('- heading "Welcome"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const textCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_text"));
    expect(textCandidate).toBeDefined();
    expect(textCandidate!.target.value).toBe("getByText('Welcome')");
  });

  it("generates getByText for link role", async () => {
    const target: Target = { value: "a.settings", kind: "css", source: "manual" };
    const { page } = mockPage('- link "Settings"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const textCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_text"));
    expect(textCandidate).toBeDefined();
    expect(textCandidate!.target.value).toBe("getByText('Settings')");
  });

  it("skips useless roles like generic", async () => {
    const { page } = mockPage('- generic "wrapper"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
  });

  it("skips candidates that already exist in existingValues set", async () => {
    const { page } = mockPage('- textbox "Email"');
    const existing = new Set(["getByRole('textbox', { name: 'Email' })"]);
    const result = await generateAriaTargetCandidates(page, cssTarget, existing, 1000);

    const roleCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_role_name"));
    expect(roleCandidate).toBeUndefined();
  });

  it("returns diagnostic when ariaSnapshot fails", async () => {
    const page = {
      locator: vi.fn().mockReturnValue({
        ariaSnapshot: vi.fn().mockRejectedValue(new Error("Element not found")),
        evaluate: vi.fn().mockResolvedValue({}),
      }),
    } as any;

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("aria_snapshot_failed");
  });

  it("falls back to runtime attributes when ariaSnapshot is unavailable", async () => {
    const page = {
      locator: vi.fn().mockReturnValue({
        ariaSnapshot: vi.fn().mockRejectedValue(new Error("Snapshot not supported")),
        evaluate: vi.fn().mockResolvedValue({
          tagName: "input",
          roleAttr: "textbox",
          inputType: "text",
          dataTestId: "customer-email",
          nameAttr: "customer_email",
          idAttr: "customer-email",
          titleAttr: "Customer email",
          rowText: "Primary contact email",
        }),
      }),
    } as any;

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.diagnostics[0]!.code).toBe("aria_snapshot_failed");
    expect(result.candidates.map((candidate) => candidate.reasonCodes[0])).toEqual(
      expect.arrayContaining([
        "runtime_attr_testid",
        "runtime_attr_name",
        "runtime_attr_id",
        "runtime_attr_title",
        "runtime_row_context",
      ])
    );
  });

  it("preserves framePath from target", async () => {
    const target: Target = {
      value: "#email",
      kind: "css",
      source: "manual",
      framePath: ['iframe[name="app"]'],
    };
    const locator = {
      ariaSnapshot: vi.fn().mockResolvedValue('- textbox "Email"'),
      getAttribute: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockResolvedValue({}),
    };
    const page = {
      frameLocator: vi.fn().mockReturnValue({
        locator: vi.fn().mockReturnValue(locator),
      }),
    } as any;

    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0]!.target.framePath).toEqual(['iframe[name="app"]']);
  });

  it("does not generate getByLabel for non-form-control roles", async () => {
    const target: Target = { value: ".btn", kind: "css", source: "manual" };
    const { page } = mockPage('- button "Submit"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const labelCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_label"));
    expect(labelCandidate).toBeUndefined();
  });

  it("does not generate getByPlaceholder for non-form-control roles", async () => {
    const target: Target = { value: ".btn", kind: "css", source: "manual" };
    const { page } = mockPage('- button "Submit"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const placeholderCandidate = result.candidates.find((c) =>
      c.reasonCodes.includes("aria_placeholder")
    );
    expect(placeholderCandidate).toBeUndefined();
  });

  it("handles node without name gracefully", async () => {
    const { page } = mockPage("- textbox");
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
  });

  it("generates getByTestId candidate from runtime attributes", async () => {
    const { page } = mockPage("- textbox", {
      evaluateResult: { tagName: "input", dataTestId: "email-field" },
    });

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const candidate = result.candidates.find((c) =>
      c.reasonCodes.includes("runtime_attr_testid")
    );
    expect(candidate).toBeDefined();
    expect(candidate!.target.value).toBe("getByTestId('email-field')");
    expect(candidate!.target.confidence).toBe(0.9);
  });

  it("generates attribute-based locator candidates for unlabeled controls", async () => {
    const { page } = mockPage("- textbox", {
      evaluateResult: {
        tagName: "input",
        nameAttr: "customer_email",
        idAttr: "customer-email",
        titleAttr: "Customer email",
      },
    });

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(
      result.candidates.find((c) => c.reasonCodes.includes("runtime_attr_name"))?.target.value
    ).toBe(
      `locator('input[name="customer_email"]')`
    );
    expect(
      result.candidates.find((c) => c.reasonCodes.includes("runtime_attr_id"))?.target.value
    ).toBe(`locator('[id="customer-email"]')`);
    expect(
      result.candidates.find((c) => c.reasonCodes.includes("runtime_attr_title"))?.target.value
    ).toBe(`getByTitle('Customer email')`);
  });

  it("generates row-context candidates for unlabeled repeated form controls", async () => {
    const { page } = mockPage("- textbox", {
      evaluateResult: {
        tagName: "input",
        rowText: "Primary contact email",
      },
    });

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const candidate = result.candidates.find((c) =>
      c.reasonCodes.includes("runtime_row_context")
    );
    expect(candidate).toBeDefined();
    expect(candidate!.target.value).toBe(
      `getByRole('row', { name: 'Primary contact email' }).getByRole('textbox')`
    );
    expect(candidate!.target.confidence).toBe(0.68);
  });

  it("skips row-context candidates for noisy volatile row text", async () => {
    const { page } = mockPage("- textbox", {
      evaluateResult: {
        tagName: "input",
        rowText: "Invoice 482910 2025-03-01 12:30 Paid",
      },
    });

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(
      result.candidates.find((c) => c.reasonCodes.includes("runtime_row_context"))
    ).toBeUndefined();
  });
});
