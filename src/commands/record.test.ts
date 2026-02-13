import { describe, expect, it } from "vitest";
import { normalizeRecordUrl } from "./record.js";
import { UserError } from "../utils/errors.js";

describe("normalizeRecordUrl", () => {
  it("keeps valid absolute URLs", () => {
    expect(normalizeRecordUrl("https://apps.crv4all.nl/veemanager")).toBe(
      "https://apps.crv4all.nl/veemanager"
    );
  });

  it("adds https protocol when missing for public domains", () => {
    expect(normalizeRecordUrl("apps.crv4all.nl/veemanager")).toBe(
      "https://apps.crv4all.nl/veemanager"
    );
  });

  it("adds http protocol when missing for localhost", () => {
    expect(normalizeRecordUrl("localhost:3000")).toBe(
      "http://localhost:3000/"
    );
  });

  it("adds http protocol when missing for private ipv4 hosts", () => {
    expect(normalizeRecordUrl("192.168.1.25:8080/path")).toBe(
      "http://192.168.1.25:8080/path"
    );
  });

  it("adds http protocol when missing for ipv6 localhost", () => {
    expect(normalizeRecordUrl("[::1]:3000")).toBe(
      "http://[::1]:3000/"
    );
  });

  it("throws for empty input", () => {
    expect(() => normalizeRecordUrl("   ")).toThrow("Starting URL is required.");
  });

  it("throws for malformed URLs", () => {
    expect(() => normalizeRecordUrl("http://")).toThrow("Invalid starting URL");
  });

  it("rejects malformed scheme typo without colon", () => {
    try {
      normalizeRecordUrl("http//example.com");
      throw new Error("expected normalizeRecordUrl to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      const userError = err as UserError;
      expect(userError.message).toContain("Invalid starting URL");
      expect(userError.hint).toContain(
        "Use a full URL like http://localhost:3000 or https://example.com"
      );
    }
  });

  it("rejects malformed scheme typo with single slash", () => {
    try {
      normalizeRecordUrl("https:/example.com");
      throw new Error("expected normalizeRecordUrl to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      const userError = err as UserError;
      expect(userError.message).toContain("Invalid starting URL");
      expect(userError.hint).toContain(
        "Use a full URL like http://localhost:3000 or https://example.com"
      );
    }
  });

  it("rejects malformed scheme typo missing slashes", () => {
    try {
      normalizeRecordUrl("https:example.com");
      throw new Error("expected normalizeRecordUrl to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      const userError = err as UserError;
      expect(userError.message).toContain("Invalid starting URL");
      expect(userError.hint).toContain(
        "Use a full URL like http://localhost:3000 or https://example.com"
      );
    }
  });
});
