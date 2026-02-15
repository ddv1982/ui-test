import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  parseImproveAssertions,
  parseImproveAssertionSource,
  resolveImproveProfile,
} from "./improve-profile.js";

describe("resolveImproveProfile", () => {
  it("applies CLI options", () => {
    const out = resolveImproveProfile({
      apply: true,
      assertions: "none",
      assertionSource: "snapshot-cli",
      report: "out.json",
    });

    expect(out.assertions).toBe("none");
    expect(out.assertionSource).toBe("snapshot-cli");
    expect(out.applySelectors).toBe(true);
    expect(out.applyAssertions).toBe(true);
    expect(out.reportPath).toBe("out.json");
  });

  it("uses defaults when omitted", () => {
    const out = resolveImproveProfile({});
    expect(out.assertions).toBe("candidates");
    expect(out.assertionSource).toBe("snapshot-native");
    expect(out.applySelectors).toBe(false);
    expect(out.applyAssertions).toBe(false);
  });

  it("--apply sets both applySelectors and applyAssertions to true", () => {
    const out = resolveImproveProfile({ apply: true });
    expect(out.applySelectors).toBe(true);
    expect(out.applyAssertions).toBe(true);
  });

  it("without --apply both applySelectors and applyAssertions are false", () => {
    const out = resolveImproveProfile({});
    expect(out.applySelectors).toBe(false);
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
