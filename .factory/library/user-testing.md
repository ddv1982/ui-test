# User Testing

Testing surface, tools, setup steps, and known quirks.

**What belongs here:** how validators/workers should exercise the user-facing surface.

---

## Primary Surface

- CLI commands:
  - `ui-test record`
  - `ui-test improve --plan`
  - `ui-test improve --apply-plan`
  - `ui-test play`

## Preferred Validation Path

1. Use focused Vitest coverage for record/improve behavior.
2. Use `src/core/improve/improve.dynamic.integration.test.ts` for brittle-fixture repair proof.
3. Use `src/core/player.integration.test.ts` plus `scripts/run-headed-parity.test.mjs` for parity coverage.
4. Final gate: `npm run test:parity:headed`.

## Constraints

- Do not use live external websites as proof of determinism.
- Prefer controlled local fixtures and ephemeral localhost servers created by tests.
- Optional manual slice may use the example app on `127.0.0.1:5173` only if needed.

## Flow Validator Guidance: CLI

- Run CLI validations in isolated temp directories (`mktemp -d`) to avoid file collisions between parallel validators.
- Use unique filename prefixes per validator (for example `flow-a-*`, `flow-b-*`) for plan/report/output artifacts.
- Do not reuse another validator's generated plan, report, or YAML output paths.
- Keep execution local and deterministic: use repository fixtures/tests only; never use external websites.
- Prefer `vitest run <target files>` coverage that directly maps to assigned assertions.

## Known Validation Quirks

- `improve` runtime treats `data:` navigation URLs as relative and reports `Cannot resolve relative navigation URL`; this can be used as deterministic runtime-failure evidence in candidate-skip assertions.
- If transient local TypeScript worktree errors block `npm run build`, validators may use the existing `dist/bin/ui-test.js` binary for CLI-flow checks.
