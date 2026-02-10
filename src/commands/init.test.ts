import { describe, expect, it } from "vitest";
import {
  buildBaseUrl,
  validateBaseOrigin,
  validatePortInput,
} from "./init.js";

describe("init URL helpers", () => {
  describe("validateBaseOrigin", () => {
    it("accepts valid http origins", () => {
      expect(validateBaseOrigin("http://localhost")).toBe(true);
      expect(validateBaseOrigin("https://example.com")).toBe(true);
    });

    it("rejects invalid protocols", () => {
      expect(validateBaseOrigin("ftp://localhost")).toMatch(/Protocol must be/);
    });

    it("rejects paths and query fragments", () => {
      expect(validateBaseOrigin("http://localhost/app")).toMatch(/protocol \+ host/i);
      expect(validateBaseOrigin("https://example.com?x=1")).toMatch(/protocol \+ host/i);
    });
  });

  describe("validatePortInput", () => {
    it("accepts blank and valid ports", () => {
      expect(validatePortInput("")).toBe(true);
      expect(validatePortInput("4000")).toBe(true);
    });

    it("rejects invalid port values", () => {
      expect(validatePortInput("0")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("70000")).toMatch(/between 1 and 65535/);
      expect(validatePortInput("abc")).toMatch(/between 1 and 65535/);
    });
  });

  describe("buildBaseUrl", () => {
    it("sets explicit port when provided", () => {
      expect(buildBaseUrl("http://localhost", "4000")).toBe("http://localhost:4000");
    });

    it("keeps default origin port when blank", () => {
      expect(buildBaseUrl("https://example.com", "")).toBe("https://example.com");
      expect(buildBaseUrl("https://example.com:8443", "")).toBe("https://example.com:8443");
    });
  });
});
