import { describe, expect, it } from "vitest";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import type { StepFinding } from "./report-schema.js";

describe("buildAssertionCandidates", () => {
  it("creates deterministic value and checked assertions for form actions", () => {
    const findings: StepFinding[] = [
      {
        index: 0,
        action: "fill",
        changed: false,
        oldTarget: { value: "#name", kind: "css", source: "manual" },
        recommendedTarget: { value: "#name", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 1,
        action: "select",
        changed: false,
        oldTarget: { value: "#country", kind: "css", source: "manual" },
        recommendedTarget: { value: "#country", kind: "css", source: "manual" },
        oldScore: 0.7,
        recommendedScore: 0.7,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 2,
        action: "check",
        changed: false,
        oldTarget: { value: "#agree", kind: "css", source: "manual" },
        recommendedTarget: { value: "#agree", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 3,
        action: "uncheck",
        changed: false,
        oldTarget: { value: "#email-opt-in", kind: "css", source: "manual" },
        recommendedTarget: { value: "#email-opt-in", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
        { action: "select", target: { value: "#country", kind: "css", source: "manual" }, value: "NL" },
        { action: "check", target: { value: "#agree", kind: "css", source: "manual" } },
        { action: "uncheck", target: { value: "#email-opt-in", kind: "css", source: "manual" } },
      ],
      findings
    );
    const candidates = out.candidates;

    expect(candidates).toHaveLength(4);
    expect(out.skippedNavigationLikeClicks).toHaveLength(0);
    expect(candidates[0]?.candidate.action).toBe("assertValue");
    expect(candidates[1]?.candidate.action).toBe("assertValue");
    expect(candidates[2]?.candidate.action).toBe("assertChecked");
    expect(candidates[3]?.candidate.action).toBe("assertChecked");
    if (candidates[2]?.candidate.action === "assertChecked") {
      expect(candidates[2].candidate.checked).toBe(true);
    }
    if (candidates[3]?.candidate.action === "assertChecked") {
      expect(candidates[3].candidate.checked).toBe(false);
    }
  });

  it("creates deterministic coverage fallback visibility assertions for click/press/hover", () => {
    const findings: StepFinding[] = [
      {
        index: 0,
        action: "click",
        changed: false,
        oldTarget: { value: "#login", kind: "css", source: "manual" },
        recommendedTarget: { value: "#login", kind: "css", source: "manual" },
        oldScore: 1,
        recommendedScore: 1,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 1,
        action: "press",
        changed: false,
        oldTarget: { value: "#login", kind: "css", source: "manual" },
        recommendedTarget: { value: "#login", kind: "css", source: "manual" },
        oldScore: 1,
        recommendedScore: 1,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 2,
        action: "hover",
        changed: false,
        oldTarget: { value: "#menu", kind: "css", source: "manual" },
        recommendedTarget: {
          value: "getByRole('link', { name: 'News' })",
          kind: "locatorExpression",
          source: "manual",
        },
        oldScore: 0.9,
        recommendedScore: 0.9,
        confidenceDelta: 0,
        reasonCodes: [],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "click", target: { value: "#login", kind: "css", source: "manual" } },
        { action: "press", target: { value: "#login", kind: "css", source: "manual" }, key: "Enter" },
        { action: "hover", target: { value: "#menu", kind: "css", source: "manual" } },
      ],
      findings
    );
    const candidates = out.candidates;

    expect(candidates).toHaveLength(3);
    expect(out.skippedNavigationLikeClicks).toHaveLength(0);
    for (const candidate of candidates) {
      expect(candidate.candidate.action).toBe("assertVisible");
      expect(candidate.candidateSource).toBe("deterministic");
      expect(candidate.coverageFallback).toBe(true);
      expect(candidate.confidence).toBe(0.76);
      expect(candidate.rationale).toContain("Coverage fallback");
    }
    const hoverCandidate = candidates[2]?.candidate;
    expect(hoverCandidate?.action).toBe("assertVisible");
    if (hoverCandidate?.action === "assertVisible") {
      expect(hoverCandidate.target.value).toBe("getByRole('link', { name: 'News' })");
    }
  });

  it("uses original step indexes mapping when provided", () => {
    const findings: StepFinding[] = [
      {
        index: 2,
        action: "fill",
        changed: true,
        oldTarget: { value: "#name", kind: "css", source: "manual" },
        recommendedTarget: { value: "getByRole('textbox', { name: 'Name' })", kind: "locatorExpression", source: "manual" },
        oldScore: 0.4,
        recommendedScore: 0.95,
        confidenceDelta: 0.55,
        reasonCodes: ["unique_match"],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "navigate", url: "https://example.com" },
        { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
      ],
      findings,
      [1, 2]
    );
    const candidates = out.candidates;

    expect(candidates).toHaveLength(1);
    expect(out.skippedNavigationLikeClicks).toHaveLength(0);
    expect(candidates[0]?.index).toBe(2);
    expect(candidates[0]?.candidate.action).toBe("assertValue");
    const appliedCandidate = candidates[0]?.candidate;
    expect(appliedCandidate?.action).toBe("assertValue");
    if (appliedCandidate?.action === "assertValue") {
      expect(appliedCandidate.target.value).toBe("getByRole('textbox', { name: 'Name' })");
    }
  });

  it("skips deterministic assertVisible fallback for navigation-like dynamic link clicks", () => {
    const out = buildAssertionCandidates(
      [
        {
          action: "click",
          target: {
            value:
              "getByRole('link', { name: 'Nederlaag voor Trump: hooggerechtshof VS oordeelt dat heffingen onwettig zijn', exact: true })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      []
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.skippedNavigationLikeClicks).toHaveLength(1);
    expect(out.skippedNavigationLikeClicks[0]?.reason).toContain(
      "navigation-like dynamic click target"
    );
  });

  it("keeps deterministic fallback for stable exact link clicks", () => {
    const out = buildAssertionCandidates(
      [
        {
          action: "click",
          target: {
            value: "getByRole('link', { name: 'Settings', exact: true })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      []
    );

    expect(out.skippedNavigationLikeClicks).toHaveLength(0);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.candidate.action).toBe("assertVisible");
  });

  it("does not skip stable selectors with story/article in id-like values", () => {
    const out = buildAssertionCandidates(
      [
        {
          action: "click",
          target: {
            value: "locator('#user-story-tab')",
            kind: "locatorExpression",
            source: "manual",
          },
        },
      ],
      []
    );

    expect(out.skippedNavigationLikeClicks).toHaveLength(0);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.candidate.action).toBe("assertVisible");
  });
});
