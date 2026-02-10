# Test Coverage Report

**Date:** 2026-02-10
**Scope:** Core runtime modules (`src/core/**`, `src/utils/**`)
**Note:** Values below are a snapshot and may change as tests evolve.

## Coverage Snapshot

Run `npm run test:coverage` to generate current coverage numbers.

The snapshot is intentionally not hardcoded here because metrics change frequently as tests evolve.

## Coverage Thresholds

Current enforced thresholds from `vitest.config.ts`:

- **Lines:** 60%
- **Functions:** 100%
- **Branches:** 50%
- **Statements:** 60%

## Notes

- Unit tests cover parser, schema validation, config loading, and player helpers (`resolveLocator`, `resolveNavigateUrl`, `stepDescription`).
- Integration tests validate full `play()` execution with a real browser and dynamic localhost fixture server.
- Function coverage remains a strict gate at 100% for the covered modules.

## Coverage Exclusions

The following files are excluded from coverage requirements:
- `src/bin/**` - CLI entry point
- `src/commands/**` - Command implementations (tested manually)
- `src/core/recorder.ts` - Interactive Playwright codegen wrapper with spawned subprocesses
- `src/utils/ui.ts` - Display formatting utility

## Integration Harness Notes

- Integration tests use a dynamic localhost port (`127.0.0.1` with `listen(0)`) to avoid fixed-port conflicts.
- YAML fixtures are copied to temp files with runtime `baseUrl` injection for stability across environments.
