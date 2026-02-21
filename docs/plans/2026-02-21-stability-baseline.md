# Stability Baseline (2026-02-21)

This baseline locks the initial quality signal before the phased Playwright API-first stability refactor.

## Baseline Commands

Required quality gates for every phase PR:

1. `npm run lint`
2. `npm run lint:typed`
3. `npm run typecheck:prod`
4. `npm test`

Program-level verification gates:

1. `npm run quality:ci`
2. `npm run test:coverage`
3. `npm run test:parity:headed`
4. `npm run build`

## Baseline Results (Local, 2026-02-21)

1. `npm run quality:ci` passed
   - `58` test files
   - `531` tests passed
2. `npm run test:coverage` passed
   - Statements: `82.34`
   - Branches: `70.10`
   - Functions: `94.89`
   - Lines: `86.44`
3. `npm run test:parity:headed` passed
   - `24` integration parity tests passed
4. `npm run build` was already green in CI baseline and remains a required final gate.

## Branch Execution Strategy

Execution branches reserved for phased merges:

1. `codex/stability-phase-1`
2. `codex/stability-phase-2`
3. `codex/stability-phase-3`
4. `codex/stability-phase-4`
5. `codex/stability-phase-5`

Policy:

1. No phase is merged without required gates green.
2. CLI commands/flags remain backward compatible.
3. Public API changes are additive only unless explicitly approved.
