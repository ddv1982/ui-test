import { describe, expect, it } from "vitest";
import { resolveTypeScriptSpecFromPackageJson } from "./run-tsc.mjs";

describe("run-tsc TypeScript spec resolution", () => {
  it("prefers devDependencies.typescript when present", () => {
    const spec = resolveTypeScriptSpecFromPackageJson({
      devDependencies: { typescript: "^5.9.3" },
      dependencies: { typescript: "5.9.2" },
    });
    expect(spec).toBe("^5.9.3");
  });

  it("falls back to dependencies.typescript when devDependencies is missing", () => {
    const spec = resolveTypeScriptSpecFromPackageJson({
      dependencies: { typescript: "~5.8.0" },
    });
    expect(spec).toBe("~5.8.0");
  });

  it("returns undefined when no valid TypeScript spec exists", () => {
    expect(resolveTypeScriptSpecFromPackageJson({})).toBeUndefined();
    expect(
      resolveTypeScriptSpecFromPackageJson({
        devDependencies: { typescript: "" },
        dependencies: { typescript: "   " },
      })
    ).toBeUndefined();
    expect(
      resolveTypeScriptSpecFromPackageJson({
        devDependencies: { typescript: 123 },
      })
    ).toBeUndefined();
  });

  it("preserves and trims raw semver/range strings", () => {
    expect(
      resolveTypeScriptSpecFromPackageJson({
        devDependencies: { typescript: " 5.9.3 " },
      })
    ).toBe("5.9.3");
    expect(
      resolveTypeScriptSpecFromPackageJson({
        devDependencies: { typescript: "^5.9.3" },
      })
    ).toBe("^5.9.3");
    expect(
      resolveTypeScriptSpecFromPackageJson({
        devDependencies: { typescript: "~5.9.0" },
      })
    ).toBe("~5.9.0");
  });
});
