import { describe, expect, it } from "vitest";
import { UserError } from "../utils/errors.js";
import {
  normalizeRequestPath,
  resolveExampleAssetPath,
  runExampleApp,
} from "./example-app.js";

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

describe("resolveExampleAssetPath", () => {
  it("rejects paths outside the app directory, including prefix siblings", () => {
    expect(
      resolveExampleAssetPath("../vue-app2/secret.txt", "/repo/examples/vue-app")
    ).toBeNull();
  });

  it("resolves paths inside the app directory", () => {
    expect(resolveExampleAssetPath("style.css", "/repo/examples/vue-app")).toBe(
      "/repo/examples/vue-app/style.css"
    );
  });
});

describe("runExampleApp", () => {
  it("rejects invalid port values", async () => {
    await expect(runExampleApp({ host: "127.0.0.1", port: "0" })).rejects.toThrow(UserError);
  });
});
