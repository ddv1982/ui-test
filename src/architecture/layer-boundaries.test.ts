import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Layer = "commands" | "app" | "core" | "infra" | "utils" | "bin" | "root";

interface Violation {
  file: string;
  fromLayer: Layer;
  specifier: string;
  targetLayer: Layer;
}

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

const disallowedImports: Record<Layer, Set<Layer>> = {
  app: new Set(["commands", "bin"]),
  bin: new Set(["commands", "app", "core", "infra", "utils"]),
  commands: new Set(["core", "infra", "bin", "root"]),
  core: new Set(["commands", "app", "infra", "bin", "root"]),
  infra: new Set(["commands", "app", "core", "bin", "root"]),
  root: new Set(),
  utils: new Set(["commands", "app", "core", "infra", "bin"]),
};

describe("layer boundaries", () => {
  it("enforces source-layer import constraints", async () => {
    const files = await listSourceFiles(srcRoot);
    const violations: Violation[] = [];

    for (const file of files) {
      const fromLayer = layerForFile(file);
      const disallowed = disallowedImports[fromLayer];
      if (!disallowed || disallowed.size === 0) {
        continue;
      }

      const imports = await findModuleSpecifiers(file);
      for (const specifier of imports) {
        const resolvedImportPath = await resolveImportPath(file, specifier);
        if (!resolvedImportPath) continue;

        const targetLayer = layerForFile(resolvedImportPath);
        if (disallowed.has(targetLayer)) {
          violations.push({
            file: toRepoPath(file),
            fromLayer,
            specifier,
            targetLayer,
          });
        }
      }
    }

    const message =
      violations.length === 0
        ? ""
        : violations
            .map(
              (violation) =>
                `${violation.file}: ${violation.fromLayer} -> ${violation.targetLayer} via ${violation.specifier}`
            )
            .join("\n");
    expect(violations, message).toEqual([]);
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

async function findModuleSpecifiers(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const imports = new Set<string>();

  const maybeAdd = (value: string | undefined) => {
    if (!value) return;
    imports.add(value);
  };

  const visit = (node: ts.Node) => {
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
  return [...imports];
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

function layerForFile(filePath: string): Layer {
  const relativePath = path.relative(srcRoot, filePath);
  const firstSegment = relativePath.split(path.sep)[0];

  if (firstSegment === "commands") return "commands";
  if (firstSegment === "app") return "app";
  if (firstSegment === "core") return "core";
  if (firstSegment === "infra") return "infra";
  if (firstSegment === "utils") return "utils";
  if (firstSegment === "bin") return "bin";
  return "root";
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
