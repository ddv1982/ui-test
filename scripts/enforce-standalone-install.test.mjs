import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getStandaloneInstallBlockMessage } from "./enforce-standalone-install.mjs";

const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

describe("enforce-standalone-install", () => {
  it("allows npm exec/npx one-off invocations", () => {
    const message = getStandaloneInstallBlockMessage(
      {
        npm_command: "exec",
        npm_config_global: "",
        INIT_CWD: "/tmp/consumer",
      },
      "/tmp/.npm/_npx/node_modules/ui-test"
    );
    expect(message).toBeUndefined();
  });

  it("allows global installs", () => {
    const message = getStandaloneInstallBlockMessage(
      {
        npm_command: "install",
        npm_config_global: "true",
        INIT_CWD: "/tmp/consumer",
      },
      "/tmp/.npm/_cacache/tmp/pkg"
    );
    expect(message).toBeUndefined();
  });

  it("allows repo-root installs for maintainers", () => {
    const cwd = "/Users/dev/projects/ui-test";
    const message = getStandaloneInstallBlockMessage(
      {
        npm_command: "install",
        npm_config_global: "",
        INIT_CWD: cwd,
      },
      cwd
    );
    expect(message).toBeUndefined();
  });

  it("blocks non-global project installs", () => {
    const message = getStandaloneInstallBlockMessage(
      {
        npm_command: "install",
        npm_config_global: "",
        INIT_CWD: "/Users/dev/projects/app",
      },
      "/Users/dev/.npm/_cacache/tmp/git-clone"
    );
    expect(message).toContain("project-local installs are not supported");
    expect(message).toContain("Install ui-test globally (see README.md)");
    expect(message).toContain("For one-off usage, see README.md");
    expect(message).toContain("npm uninstall ui-test");
  });

  it("package preinstall uses the tested policy entrypoint", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    expect(packageJson.scripts.preinstall).toBe(
      "node ./scripts/enforce-standalone-install.mjs"
    );
  });

  it("package is private to prevent accidental npm registry publishing", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    expect(packageJson.private).toBe(true);
  });
});
