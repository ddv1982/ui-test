import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  normalizeRecordUrl,
  parseRecordBrowser,
  resolveRecordProfile,
} from "./record-profile.js";

describe("resolveRecordProfile", () => {
  it("applies CLI values and normalizes optionals", () => {
    const out = resolveRecordProfile({
      browser: "firefox",
      device: "  iPhone 13  ",
      testIdAttribute: "  data-qa  ",
      loadStorage: "  .auth/in.json  ",
      saveStorage: "  .auth/out.json  ",
    });

    expect(out).toEqual({
      browser: "firefox",
      device: "iPhone 13",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
      outputDir: "e2e",
    });
  });

  it("uses defaults when CLI values are unset", () => {
    const out = resolveRecordProfile({});
    expect(out.browser).toBe("chromium");
    expect(out.outputDir).toBe("e2e");
  });
});

describe("record-profile parsing", () => {
  it("parses valid enums", () => {
    expect(parseRecordBrowser("Webkit")).toBe("webkit");
  });

  it("rejects invalid enums", () => {
    expect(() => parseRecordBrowser("safari")).toThrow(UserError);
  });

  it("normalizes record URLs", () => {
    expect(normalizeRecordUrl("example.com/app")).toBe("https://example.com/app");
    expect(normalizeRecordUrl("localhost:3000")).toBe("http://localhost:3000/");
  });
});
