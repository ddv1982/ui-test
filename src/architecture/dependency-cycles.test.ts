import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(srcRoot, "..");
const compilerOptions = loadCompilerOptions();
const moduleResolutionHost: ts.ModuleResolutionHost = {
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
  realpath: ts.sys.realpath,
  getCurrentDirectory: () => repoRoot,
};

describe("dependency cycles", () => {
  it("has no source-level cycles across production ts files", async () => {
    const files = await listSourceFiles(srcRoot);
    const graph = new Map<string, string[]>();

    for (const file of files) {
      const deps = await resolveRelativeDependencies(file);
      graph.set(file, deps);
    }

    const cycles = findCycles(graph);
    const cycleDescriptions = cycles.map((cycle) =>
      cycle.map((node) => toRepoPath(node)).join(" -> ")
    );
    expect(cycleDescriptions, cycleDescriptions.join("\n")).toEqual([]);
  });
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    if (entry.name.endsWith(".integration.test.ts")) continue;
    out.push(fullPath);
  }
  return out;
}

async function resolveRelativeDependencies(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const specifiers = new Set<string>();
  const maybeAdd = (specifier: string | undefined) => {
    if (!specifier) return;
    specifiers.add(specifier);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      maybeAdd(readStringLiteral(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node)) {
      maybeAdd(readStringLiteral(node.moduleSpecifier));
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0
      ) {
        maybeAdd(readStringLiteral(node.arguments[0]));
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument)) {
        maybeAdd(readStringLiteral(argument.literal));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  const deps = new Set<string>();
  for (const specifier of specifiers) {
    const resolved = await resolveImportPath(filePath, specifier);
    if (resolved) deps.add(resolved);
  }
  return [...deps];
}

function readStringLiteral(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

async function resolveImportPath(
  filePath: string,
  specifier: string
): Promise<string | undefined> {
  const tsResolved = resolveWithTypeScript(filePath, specifier);
  if (tsResolved) {
    return tsResolved;
  }

  const manualBase = resolveManualBase(filePath, specifier);
  if (!manualBase) return undefined;

  const candidate = manualBase;
  const normalized = candidate.endsWith(".js")
    ? candidate.slice(0, -3) + ".ts"
    : candidate;

  const withExtensionCandidates = normalized.endsWith(".ts")
    ? [normalized]
    : [normalized + ".ts", path.join(normalized, "index.ts")];

  for (const importPath of withExtensionCandidates) {
    if (importPath.startsWith(srcRoot) && (await exists(importPath))) {
      return importPath;
    }
  }

  return undefined;
}

function resolveWithTypeScript(
  filePath: string,
  specifier: string
): string | undefined {
  const resolution = ts.resolveModuleName(
    specifier,
    filePath,
    compilerOptions,
    moduleResolutionHost
  ).resolvedModule;
  if (!resolution) return undefined;

  const resolvedPath = path.resolve(resolution.resolvedFileName);
  if (!resolvedPath.startsWith(srcRoot)) return undefined;
  if (resolvedPath.endsWith(".d.ts")) return undefined;
  return resolvedPath;
}

function resolveManualBase(
  filePath: string,
  specifier: string
): string | undefined {
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(filePath), specifier);
  }
  if (specifier.startsWith("src/")) {
    return path.resolve(repoRoot, specifier);
  }
  if (specifier.startsWith("@/")) {
    return path.resolve(srcRoot, specifier.slice(2));
  }
  return undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const dfs = (node: string) => {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        dfs(dep);
        continue;
      }
      if (!inStack.has(dep)) continue;

      const startIndex = stack.indexOf(dep);
      if (startIndex < 0) continue;

      const cycle = [...stack.slice(startIndex), dep];
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        cycles.push(cycle);
      }
    }

    stack.pop();
    inStack.delete(node);
  };

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

function toRepoPath(filePath: string): string {
  return path.relative(path.resolve(srcRoot, ".."), filePath).replaceAll(path.sep, "/");
}

function loadCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    return {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    };
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    };
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath
  );
  return parsed.options;
}
