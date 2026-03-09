# Architecture

Architectural decisions, patterns discovered, and conventions.

**What belongs here:** Layer rules, module boundaries, import patterns, naming conventions.

---

## Layered Architecture

```
bin → index (CLI entry)
  ↓
commands → app (services + options) + utils
  ↓
app → core + infra + utils
  ↓
core → contracts (interfaces) + utils
  ↓
infra → contracts + utils (implements interfaces)
  ↓
utils (no upward dependencies)
```

Enforced by `src/architecture/layer-boundaries.test.ts` and `src/architecture/dependency-cycles.test.ts`.

## Key Patterns

- **Dependency inversion:** `core/contracts/` defines interfaces, `infra/` implements them
- **Re-export adapters:** `infra/*/` has adapter files that re-export concrete implementations
- **Profile pattern:** `app/options/` transforms CLI args into validated config objects
- **Service pattern:** `app/services/` orchestrates core modules with infrastructure

## Module Sizes

- `improve/` — largest module (~65 files), handles selector/assertion improvement
- `play/` — test execution engine
- `runtime/` — browser runtime helpers
- `transform/` — code-to-YAML transformations
- `recording/` — event canonicalization
