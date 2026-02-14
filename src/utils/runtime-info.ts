import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type InvocationClassification =
  | "inside-workspace"
  | "outside-workspace"
  | "unverifiable";

export interface InvocationInfo {
  rawInvocation: string | undefined;
  resolvedInvocationPath?: string;
  classification: InvocationClassification;
}

export interface RuntimeInfo {
  cliVersion: string;
  nodeVersion: string;
  cwd: string;
  workspaceRoot: string;
  invocation: InvocationInfo;
  localPackageRoot?: string;
  localPackageVersion?: string;
}

const VERSION_FALLBACK = "0.1.0";

export function getCliVersion(): string {
  const runtimePath = fileURLToPath(import.meta.url);
  const runtimeDir = path.dirname(runtimePath);
  const packageJsonPath = findNearestPackageJson(runtimeDir);
  if (!packageJsonPath) return VERSION_FALLBACK;

  const version = readPackageVersion(packageJsonPath);
  return version ?? VERSION_FALLBACK;
}

export function collectRuntimeInfo(
  cwd = process.cwd(),
  argv1 = process.argv[1],
  nodeVersion = process.version
): RuntimeInfo {
  const resolvedCwd = path.resolve(cwd);
  const workspaceRoot = resolveWorkspaceRoot(resolvedCwd);
  const localPackageRoot = resolveLocalUiTestPackageRoot(resolvedCwd);
  const localUiTestPackageJson = localPackageRoot
    ? path.join(localPackageRoot, "package.json")
    : undefined;
  return {
    cliVersion: getCliVersion(),
    nodeVersion,
    cwd: resolvedCwd,
    workspaceRoot,
    invocation: classifyInvocationPath(workspaceRoot, argv1),
    localPackageRoot,
    localPackageVersion: localUiTestPackageJson
      ? readPackageVersion(localUiTestPackageJson)
      : undefined,
  };
}

export function classifyInvocationPath(cwd: string, argv1: string | undefined): InvocationInfo {
  const resolvedInvocationPath = resolveInvocationPath(argv1, cwd);
  if (!resolvedInvocationPath) {
    return {
      rawInvocation: argv1,
      classification: "unverifiable",
    };
  }

  return {
    rawInvocation: argv1,
    resolvedInvocationPath,
    classification: isPathInside(resolvedInvocationPath, cwd)
      ? "inside-workspace"
      : "outside-workspace",
  };
}

export function resolveInvocationPath(
  argv1: string | undefined,
  cwd: string
): string | undefined {
  if (!argv1) return undefined;

  if (argv1.startsWith("file://")) {
    try {
      return path.resolve(fileURLToPath(argv1));
    } catch {
      return undefined;
    }
  }

  if (path.isAbsolute(argv1)) {
    return path.resolve(argv1);
  }

  // Relative script paths (for example: ./dist/bin/ui-test.js or dist/bin/ui-test.js).
  if (argv1.includes(path.sep) || argv1.includes("/") || argv1.includes("\\")) {
    return path.resolve(cwd, argv1);
  }

  // Bare command token (for example: ui-test) cannot be resolved reliably.
  return undefined;
}

export function resolveWorkspaceRoot(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  const localPackageRoot = resolveLocalUiTestPackageRoot(resolvedCwd);
  if (localPackageRoot) return localPackageRoot;

  const fallbackPackageJsonPath = findNearestPackageJson(resolvedCwd);
  return fallbackPackageJsonPath ? path.dirname(fallbackPackageJsonPath) : resolvedCwd;
}

export function resolveLocalUiTestPackageRoot(cwd: string): string | undefined {
  const resolvedCwd = path.resolve(cwd);
  const packageJsonPath = findNearestUiTestPackageJson(resolvedCwd);
  return packageJsonPath ? path.dirname(packageJsonPath) : undefined;
}

export function isProjectLocalUiTestInvocation(
  cwd = process.cwd(),
  argv1 = process.argv[1]
): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedInvocationPath = resolveInvocationPath(argv1, resolvedCwd);
  if (!resolvedInvocationPath) return false;

  const candidatePaths = new Set([resolvedInvocationPath]);
  try {
    candidatePaths.add(path.resolve(fs.realpathSync.native(resolvedInvocationPath)));
  } catch {
    // Ignore missing/broken symlink resolution; plain resolved path check still applies.
  }

  let current = resolvedCwd;
  while (true) {
    const localUiTestRoot = path.join(current, "node_modules", "ui-test");
    for (const candidate of candidatePaths) {
      if (isPathInside(candidate, localUiTestRoot)) return true;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return false;
}

export function isPathInside(targetPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  if (relative === "") return true;
  if (relative === "..") return false;
  if (relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
}

function findNearestPackageJson(startDir: string): string | undefined {
  return findNearestPackageJsonMatching(startDir, () => true);
}

function findNearestUiTestPackageJson(startDir: string): string | undefined {
  return findNearestPackageJsonMatching(startDir, isUiTestPackage);
}

function findNearestPackageJsonMatching(
  startDir: string,
  predicate: (packageJsonPath: string) => boolean
): string | undefined {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate) && predicate(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readPackageVersion(packageJsonPath: string): string | undefined {
  const parsed = readPackageJson(packageJsonPath);
  if (!parsed) return undefined;
  if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
    return parsed.version.trim();
  }
  return undefined;
}

function readPackageJson(packageJsonPath: string): Record<string, unknown> | undefined {
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isUiTestPackage(packageJsonPath: string): boolean {
  const parsed = readPackageJson(packageJsonPath);
  if (!parsed) return false;

  if (parsed.name === "ui-test") return true;

  const bin = parsed.bin;
  if (typeof bin === "string") return parsed.name === "ui-test";
  if (!bin || typeof bin !== "object" || Array.isArray(bin)) return false;
  return Object.prototype.hasOwnProperty.call(bin, "ui-test");
}
