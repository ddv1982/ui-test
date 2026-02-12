import { describe, expect, it } from "vitest";
import { UserError } from "../utils/errors.js";
import { normalizeRequestPath, runExampleApp } from "./example-app.js";

describe("normalizeRequestPath", () => {
  it("maps root path to index.html", () => {
    expect(normalizeRequestPath("/")).toBe("index.html");
  });

  it("strips query params and leading slashes", () => {
    expect(normalizeRequestPath("/style.css?v=1")).toBe("style.css");
  });

  it("falls back to root for malformed URL encoding", () => {
    expect(normalizeRequestPath("/%E0%A4%A")).toBe("index.html");
  });
});

describe("runExampleApp", () => {
  it("rejects invalid port values", async () => {
    await expect(runExampleApp({ host: "127.0.0.1", port: "0" })).rejects.toThrow(UserError);
  });
});
