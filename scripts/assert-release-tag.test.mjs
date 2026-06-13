import { describe, expect, it } from "vitest";
import {
  assertReleaseTagMatchesVersion,
  expectedReleaseTag,
  normalizeReleaseTag,
} from "./assert-release-tag.mjs";

describe("assert-release-tag", () => {
  it("accepts v-prefixed tags that match package versions", () => {
    expect(() => assertReleaseTagMatchesVersion("v1.2.3", "1.2.3")).not.toThrow();
  });

  it("accepts full Git tag refs from GitHub Actions", () => {
    expect(normalizeReleaseTag("refs/tags/v1.2.3")).toBe("v1.2.3");
  });

  it("builds expected release tags from package versions", () => {
    expect(expectedReleaseTag("1.2.3")).toBe("v1.2.3");
  });

  it("rejects tags that do not match the package version", () => {
    expect(() => assertReleaseTagMatchesVersion("v1.2.4", "1.2.3")).toThrow(
      /Expected v1\.2\.3/
    );
  });

  it("rejects missing tags", () => {
    expect(() => normalizeReleaseTag(undefined)).toThrow(/Release tag is required/);
  });
});
