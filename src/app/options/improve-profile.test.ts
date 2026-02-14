import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  parseImproveAssertions,
  parseImproveAssertionSource,
  resolveImproveProfile,
} from "./improve-profile.js";

describe("resolveImproveProfile", () => {
  it("merges CLI and config with proper precedence", () => {
    const out = resolveImproveProfile(
      {
        apply: false,
        applyAssertions: true,
        assertions: "none",
        assertionSource: "snapshot-cli",
        report: "out.json",
      },
      {
        improveApplyMode: "apply",
        improveApplyAssertions: false,
        improveAssertionSource: "deterministic",
        improveAssertions: "candidates",
      }
    );

    expect(out.assertions).toBe("none");
    expect(out.assertionSource).toBe("snapshot-cli");
    expect(out.apply).toBe(false);
    expect(out.applyAssertions).toBe(true);
    expect(out.reportPath).toBe("out.json");
  });

  it("uses defaults when omitted", () => {
    const out = resolveImproveProfile({}, {});
    expect(out.assertions).toBe("candidates");
    expect(out.assertionSource).toBe("deterministic");
    expect(out.apply).toBe(false);
    expect(out.applyAssertions).toBe(false);
  });
});

describe("improve-profile parsing", () => {
  it("accepts valid values", () => {
    expect(parseImproveAssertions("CANDIDATES")).toBe("candidates");
    expect(parseImproveAssertionSource("SNAPSHOT-CLI")).toBe("snapshot-cli");
  });

  it("rejects invalid values", () => {
    expect(() => parseImproveAssertions("all")).toThrow(UserError);
    expect(() => parseImproveAssertionSource("auto")).toThrow(UserError);
  });
});
