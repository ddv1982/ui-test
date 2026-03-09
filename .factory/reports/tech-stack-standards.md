# Tech Stack Standards & Best Practices Report

> Generated: 2026-03-09 | Project: ui-test  
> Stack: TypeScript 5.9 · Node.js ≥20.12 (ESM) · Vitest 4 · ESLint 9 + typescript-eslint 8 · Playwright 1.58 · Zod 4 · Commander 14

---

## 1. TypeScript 5.9 Best Practices & New Features

### Key New Features
- **`import defer` syntax**: Defers module evaluation until first use. Useful for reducing CLI startup time:
  ```ts
  import defer * as analytics from "./analytics.js";
  // Module only loads when analytics.* is first accessed
  ```
- **`--module node20`**: New module resolution mode that aligns with Node.js 20+ semantics. Consider upgrading from `Node16` to `node20` when ready.
- **Minimal `tsc --init`**: Generated tsconfigs are now lean and prescriptive.
- **Configurable hover length**: Better DX in editors.
- **Performance optimizations**: Faster type-checking in complex schemas.

### Best Practices for Strict TypeScript
- **Always enable `strict: true`** (already done ✅). This includes `strictNullChecks`, `strictPropertyInitialization`, `noImplicitAny`, etc.
- **Use discriminated unions** over enums for state modeling (better exhaustiveness checking, tree-shakeable).
- **Use `satisfies` operator** for type-safe defaults that preserve literal types.
- **Use `const` type parameters** where applicable for stricter generic inference.
- **Avoid `any`** — use `unknown` for truly unknown types, then narrow with type guards.
- **Use branded types** for domain-specific primitives (file paths, IDs, etc.).
- **Use `NoInfer<T>`** utility type (TS 5.4+) to prevent unwanted inference widening.

### Anti-patterns to Avoid
- Using `as` type assertions instead of proper type narrowing
- `// @ts-ignore` without `@ts-expect-error` (the latter fails if the suppressed error is fixed)
- Overuse of `enum` — prefer `as const` objects or union types
- Non-exhaustive `switch` statements on union types (enable `switch-exhaustiveness-check` rule)
- Using `Function` type (use specific function signatures instead)

---

## 2. ESLint 9 Flat Config + typescript-eslint 8 Best Practices

### Current Project Config Assessment
The project already uses modern flat config with `defineConfig()` and has two configs:
- `eslint.config.mjs` — standard linting
- `eslint.typed.config.mjs` — type-checked linting (with `recommendedTypeChecked`)

### Recommended Config Tiers (typescript-eslint 8)

| Config | Description | Use Case |
|--------|-------------|----------|
| `recommended` | Core correctness rules | Minimum baseline |
| `recommended-type-checked` | + type-aware rules | CI/pre-commit (already in `lint:typed`) |
| `strict` | + opinionated correctness | Stricter projects |
| `strict-type-checked` | + strict type-aware | Maximum strictness |
| `stylistic` | Consistent style rules | Team consistency |
| `stylistic-type-checked` | + type-aware style | With typed linting |

### Recommended ESLint Rules for Strict TypeScript CLI Projects

**Bug Prevention (Critical)**:
```js
"@typescript-eslint/no-floating-promises": "error",     // Unhandled promises in CLI = silent failures
"@typescript-eslint/no-misused-promises": "error",       // Promises in non-async contexts
"@typescript-eslint/await-thenable": "error",            // Awaiting non-thenables
"@typescript-eslint/no-unsafe-assignment": "error",      // any propagation
"@typescript-eslint/no-unsafe-call": "error",            // Calling any-typed values
"@typescript-eslint/no-unsafe-member-access": "error",   // Accessing props on any
"@typescript-eslint/no-unsafe-return": "error",          // Returning any from functions
"@typescript-eslint/strict-boolean-expressions": "warn", // Truthy/falsy checks on non-booleans
"@typescript-eslint/switch-exhaustiveness-check": "error",// Catch missing union cases
```

**Code Quality**:
```js
"@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
"@typescript-eslint/no-explicit-any": "error",           // In production code
"@typescript-eslint/explicit-function-return-type": "off",// Usually too noisy
"@typescript-eslint/consistent-type-imports": "error",   // type-only imports
"@typescript-eslint/no-import-type-side-effects": "error",
"@typescript-eslint/no-unnecessary-condition": "warn",   // Checks that are always true/false
"@typescript-eslint/prefer-nullish-coalescing": "warn",  // ?? over ||
"@typescript-eslint/prefer-optional-chain": "warn",      // ?. over && chains
```

### Flat Config Best Practices
- Use `defineConfig()` helper (already done ✅) — provides type checking in config
- Use `eslint.config.mjs` for ESM projects (already done ✅)
- Use `tseslint.config()` helper for type-safe config composition
- Use `files` patterns to scope rules per file type
- Disable type-checked rules in test files with `tseslint.configs.disableTypeChecked` (already done ✅)
- Keep typed linting as a separate config/script for faster dev feedback (already done ✅)

---

## 3. Vitest 4.x Testing Best Practices

### Configuration Best Practices
- **Use `vitest/config`** for defineConfig (already done ✅)
- **Set appropriate timeouts** for integration tests (already done ✅ — 30s)
- **Use v8 coverage provider** for Node.js projects (already done ✅)
- **Set coverage thresholds** to prevent regression (already done ✅)
- **Use `vitest run`** in CI (no watch mode) — Vitest 4 auto-detects non-TTY
- **Isolate test files by default** (`isolate: true` is default)

### Testing Patterns for CLI Tools

**1. CLI invocation testing** (recommended pattern):
```ts
import { execaSync } from "execa";
import { join } from "node:path";

function invokeCLI(args: string[], cwd?: string) {
  try {
    const result = execaSync(process.execPath, [CLI_PATH, ...args], { cwd });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr };
  }
}
```

**2. Mocking `process.exit`**:
```ts
const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
  throw new Error(`process.exit: ${code}`);
});
```

**3. Testing with fixtures**:
- Create fixture directories in `tests/fixtures/`
- Use `import.meta.dirname` for path resolution
- Clean up temp files in `afterEach`/`afterAll`

**4. Snapshot testing for CLI output**:
```ts
import stripAnsi from "strip-ansi";
const output = invokeCLI(["help"]);
expect(stripAnsi(output.stdout)).toMatchSnapshot();
```

**5. Testing async CLI operations**:
```ts
it("handles timeout gracefully", async () => {
  const result = await execa(process.execPath, [CLI_PATH, "record", "--timeout", "100"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("timed out");
});
```

### Vitest 4 Specific Notes
- **Mock constructors**: Arrow functions may fail as mock constructors in Vitest 4. Use `function` expressions:
  ```ts
  // ❌ Vitest 4 may throw "not a constructor"
  vi.fn(() => ({ ... }))
  // ✅ Use function expression
  vi.fn(function() { return { ... }; })
  ```
- **vi.mock hoisting**: `vi.mock()` calls are hoisted to the top of the file. Use `vi.doMock()` for dynamic/conditional mocking.
- **`vi.waitFor()`**: Available since Vitest 0.34.5+ for polling assertions.

---

## 4. Node.js 20+ ESM Best Practices

### Module System
- **Use `"type": "module"` in package.json** (already done ✅)
- **Always include `.js` extension in imports** — required for Node16/node20 module resolution
- **Use `node:` prefix for all built-in modules**:
  ```ts
  import { readFile } from "node:fs/promises";
  import path from "node:path";
  ```
  This makes it instantly clear the module is built-in, not a third-party package.

### Path Handling in ESM
- **Use `import.meta.dirname`** (available since Node 20.11.0) instead of the old `fileURLToPath` pattern:
  ```ts
  // ✅ Modern (Node 20.11+)
  const dir = import.meta.dirname;
  const file = import.meta.filename;

  // ❌ Old pattern (still works but verbose)
  import { fileURLToPath } from "node:url";
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  ```
  **Note**: The project targets `>=20.12.0` so `import.meta.dirname` is safe to use.

### ESM Anti-patterns
- ❌ Using `require()` in ESM files — use `import` or `createRequire()` only when necessary
- ❌ Missing file extensions in relative imports
- ❌ Using `__dirname` / `__filename` (CJS globals, undefined in ESM)
- ❌ Using `module.exports` / `exports` in ESM
- ❌ Not using `node:` prefix for built-in modules (ambiguity risk)

### `require(esm)` Interop
- Node.js 20 has backported `require(esm)` support, but it's still best to be ESM-first
- Library authors can now ship ESM-only packages since all LTS Node.js versions support `require(esm)`

---

## 5. Zod 4 Migration & Best Practices

### Critical Breaking Changes from v3

**Error customization API overhaul** (highest impact):
```ts
// ❌ Zod 3 (deprecated)
z.string().min(5, { message: "Too short" });
z.string({ required_error: "Required", invalid_type_error: "Bad type" });

// ✅ Zod 4
z.string().min(5, { error: "Too short" });
z.string({ error: (issue) => issue.input === undefined ? "Required" : "Bad type" });
```

**`.superRefine()` → `.check()`**:
```ts
// ❌ Zod 3
schema.superRefine((val, ctx) => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Error" });
  return z.NEVER;
});

// ✅ Zod 4
schema.check((ctx) => {
  ctx.issues.push({ message: "Error" });
});
```

**`.merge()` is deprecated** — use `.extend()`:
```ts
// ❌ Zod 3
const merged = schemaA.merge(schemaB);

// ✅ Zod 4
const merged = schemaA.extend(schemaB.shape);
```

**Error access changes**:
```ts
// ❌ Zod 3
error.errors  // removed
error.flatten()
error.format()

// ✅ Zod 4
error.issues
z.flattenError(error)
z.prettifyError(error)  // new! nice formatted string
```

**`.pipe()` is stricter**: v4 enforces input/output type compatibility more strictly. May need adjustments if using `.pipe()` for schema composition.

**`.refine()` no longer narrows types**: Type predicates in `.refine()` callbacks are ignored in v4. Use `.transform()` or `.check()` for narrowing.

**`z.coerce` input is now `unknown`**: The inferred input type changed from specific types to `unknown`.

**`.strict()`, `.passthrough()`, `.strip()` changes**: Now use `z.object({}).options({ unrecognized: "error" | "passthrough" | "strip" })` pattern.

### Zod 4 New Features to Use
- **`z.prettifyError()`**: Built-in pretty error formatting
- **`z.literal()` with multiple values**: `z.literal("a", "b", "c")`
- **`z.stringbool()`**: Parses "true"/"false" strings to booleans
- **Number formats**: `z.number().format("int32")`, etc.
- **Template literal types**: `z.templateLiteral(z.string(), z.literal("_"), z.number())`
- **Global registry**: `z.globalRegistry.add(schema, { name: "MySchema" })`
- **Internationalization**: `z.config(z.locales.en())`
- **File schemas**: `z.file()` for File validation
- **`z.interface()`**: For recursive/self-referential schemas

### Performance
- Zod 4 is **7-20x faster** than Zod 3 in benchmarks
- `tsc` type-checking of Zod schemas is ~10x faster (major DX improvement)

---

## 6. Commander 14 Patterns

### New in Commander 14
- **Option/command groups**: Organize help output with `.optionsGroup()` and `.helpGroup()`
- **State save/restore**: `saveStateBeforeParse()` / `restoreStateBeforeParse()` for testing
- **Better TypeScript support**: Improved type inference for options and arguments

### CLI Structure Best Practices
```ts
import { Command } from "commander";

const program = new Command()
  .name("ui-test")
  .description("No-code E2E testing framework")
  .version("0.1.0");

// Subcommand pattern
program
  .command("record")
  .description("Record a browser test")
  .option("-u, --url <url>", "Target URL")
  .option("-o, --output <path>", "Output YAML file")
  .action(async (opts) => {
    // Action logic
  });

// Parse after all commands defined
program.parseAsync(process.argv);
```

### Best Practices
- Use `.parseAsync()` for commands with async actions
- Use `.exitOverride()` in tests to prevent `process.exit()` calls
- Use `.showHelpAfterError()` for better UX
- Use `.showSuggestionAfterError()` for typo correction
- Validate options with Zod schemas inside action handlers
- Use `.hook("preAction", ...)` for common setup (logging, config loading)

---

## 7. Common Anti-Patterns in TypeScript CLI Projects

### Architecture Anti-patterns
1. **God module**: One file handling parsing, validation, business logic, and output. Separate concerns.
2. **No exit code standards**: Always use consistent exit codes (0=success, 1=error, 2=usage error).
3. **Swallowed errors**: `catch(e) {}` or `catch(e) { console.error(e) }` without proper exit codes.
4. **Sync file operations**: Use `node:fs/promises` for I/O-heavy operations.
5. **Not handling signals**: CLI should handle `SIGINT`/`SIGTERM` for graceful cleanup.
6. **Hardcoded paths**: Use `import.meta.dirname` and proper path resolution.

### TypeScript-Specific Anti-patterns
1. **`any` leakage**: One `any` propagates silently through the codebase.
2. **Type assertions over narrowing**: `value as Type` instead of type guards.
3. **Ignoring `Promise<void>` returns**: Floating promises that silently fail.
4. **Barrel exports with side effects**: `index.ts` re-exporting everything can cause circular deps.
5. **Over-typing**: Using `interface` when a simple type alias suffices; adding generics unnecessarily.

### CLI UX Anti-patterns
1. **No spinner/progress for long operations**: Use `ora` for operations >500ms.
2. **Raw error dumps**: Show user-friendly errors with `chalk`, reserve stack traces for `--verbose`.
3. **No `--quiet`/`--verbose` flags**: Provide output level control.
4. **Not respecting `NO_COLOR`**: Check `process.env.NO_COLOR` before using chalk.
5. **Writing to stdout and stderr inconsistently**: Use stdout for data/results, stderr for status/logs.
6. **Not supporting piping**: Check `process.stdout.isTTY` before showing interactive elements.

---

## 8. Deprecations & Breaking Changes Watch List

| Package | Version | Key Change |
|---------|---------|------------|
| TypeScript | 5.9→6.0 | `--module node20` may become default; TS 7 (Go rewrite) in progress |
| ESLint | 9.x | Legacy `.eslintrc` fully removed; must use flat config |
| typescript-eslint | 8.x | `ban-types` removed (replaced by `no-restricted-types`); config names changed |
| Zod | 4.x | `message`→`error`, `superRefine`→`check`, `merge` deprecated, `errorMap` removed |
| Commander | 14.x | Support policy: 12 months per major version |
| Node.js | 20→22 | `require(esm)` enabled by default in 22.12+; Node 18 EOL April 2025 |
| Vitest | 4.x | Mock constructor behavior changes; stricter ESM handling |

---

## 9. Project-Specific Observations

Based on the current project configuration:

1. **✅ Good**: ESM-first with `"type": "module"`, strict TS, separate typed lint config
2. **✅ Good**: Coverage thresholds enforced, v8 provider used
3. **✅ Good**: `defineConfig()` used in ESLint configs
4. **Consider**: Upgrading to `strict` or `strict-type-checked` in ESLint config for stricter rules
5. **Consider**: Adding `@typescript-eslint/no-floating-promises` to typed config (critical for CLI)
6. **Consider**: Using `import.meta.dirname` instead of `fileURLToPath(import.meta.url)` pattern where applicable
7. **Consider**: Adding `@typescript-eslint/consistent-type-imports` for cleaner imports
8. **Note**: `eslint.typed.config.mjs` uses the old `fileURLToPath` pattern for `tsconfigRootDir` — could use `import.meta.dirname`
9. **Note**: Ensure all Zod usage follows v4 patterns (`error` not `message`, etc.)
