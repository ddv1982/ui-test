import path from "node:path";
import { fileURLToPath } from "node:url";

function isTrue(value) {
  return String(value ?? "").toLowerCase() === "true";
}

function isExecInvocation(env) {
  return String(env.npm_command ?? "").trim() === "exec";
}

function isRepoRootInstall(env, cwd) {
  const initCwd = env.INIT_CWD;
  if (!initCwd) return false;
  return path.resolve(initCwd) === path.resolve(cwd);
}

export function getStandaloneInstallBlockMessage(env = process.env, cwd = process.cwd()) {
  if (isExecInvocation(env)) return undefined;
  if (isTrue(env.npm_config_global)) return undefined;
  if (isRepoRootInstall(env, cwd)) return undefined;

  return [
    "[ui-test] Standalone install policy: project-local installs are not supported.",
    "",
    "Install/run ui-test in standalone mode instead:",
    "  npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart",
    "  npm i -g ui-test",
    "  ui-test bootstrap quickstart",
    "",
    "Do not add ui-test to dependencies/devDependencies of other projects.",
  ].join("\n");
}

export function enforceStandaloneInstall(env = process.env, cwd = process.cwd()) {
  const message = getStandaloneInstallBlockMessage(env, cwd);
  if (!message) return;
  console.error(message);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  enforceStandaloneInstall();
}
