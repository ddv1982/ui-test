import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  ASSERTION_POLICY_CONFIG,
  DEFAULT_IMPROVE_ASSERTION_POLICY,
  resolveAssertionPolicyConfig,
} from "./assertion-policy.js";
import type { ImproveAssertionPolicy } from "./improve-types.js";

describe("assertion policy", () => {
  it("resolves default policy when undefined", () => {
    expect(resolveAssertionPolicyConfig(undefined)).toBe(
      ASSERTION_POLICY_CONFIG[DEFAULT_IMPROVE_ASSERTION_POLICY]
    );
  });

  it("throws UserError for invalid runtime policy values", () => {
    const invalidPolicy = "strict" as unknown as ImproveAssertionPolicy;
    expect(() => resolveAssertionPolicyConfig(invalidPolicy)).toThrow(UserError);
    expect(() => resolveAssertionPolicyConfig(invalidPolicy)).toThrow(
      "Invalid assertion policy: strict"
    );
  });
});
