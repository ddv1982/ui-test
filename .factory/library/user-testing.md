# User Testing

Testing surface: tools, URLs, setup steps, isolation notes, known quirks.

**What belongs here:** How to manually verify the application, testing tools available, known testing limitations.

---

## Testing Surface

This is a CLI library — no running web application. Validation is through automated quality gates:

- `npm run quality:ci` — full gate: lint + lint:typed + typecheck:prod + test
- `npm run test:coverage` — tests with V8 coverage reporting
- `npm run build` — production TypeScript compilation

## Verification Commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint base config (zero warnings required) |
| `npm run lint:typed` | ESLint typed config with type-aware rules |
| `npm run typecheck:prod` | TypeScript production build check |
| `npm run typecheck:test` | TypeScript full check including tests |
| `npm test` | Vitest run (617+ tests) |
| `npm run test:coverage` | Vitest with coverage thresholds |
| `npm run build` | Full production build |

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines >= 82%, Functions >= 90%, Branches >= 65%, Statements >= 80%
- Scope: `src/core/**` and `src/utils/**` only

## Known Quirks

- Architecture tests run as part of the normal test suite
- `tsconfig.build.json` is stricter than `tsconfig.json` (adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- Test files are excluded from build compilation but included in `tsconfig.json` check
