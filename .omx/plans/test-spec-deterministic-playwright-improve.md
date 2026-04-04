# Test Spec: deterministic Playwright record/improve architecture

## Scope
This spec covers regression evidence for the ongoing cleanup of recording/import normalization and `src/core/improve/**` orchestration.

## Required regression coverage

### 1. Recording defaults
- `record-profile` defaults to `improveMode=report`
- profile summary reflects review-first default
- `record-service` default auto-improve uses deterministic assertions and report-only mode
- explicit `--improve-mode apply` still writes improved output

### 2. Shared record/import output path
- recorder output keeps normalized first navigation
- recorder output derives `baseUrl` correctly
- DevTools import uses the same normalization/output path
- shared helper module has direct tests for path, baseUrl, and normalized steps

### 3. Improve execution planning
- deterministic review mode does not require browser launch
- snapshot-native review mode still requires browser launch
- apply mode still launches runtime path when needed

### 4. Improve-runner orchestration extractions
- execution-plan helper behavior is directly tested
- runtime failing step resolution/removal helper behavior is directly tested
- extracted helpers preserve output-step index remapping, findings filtering, and snapshot remapping
- build/proposed-test helpers do not leak `undefined` optional fields under exact optional property typing

### 5. Full integration safety net
- existing improve integration benchmark still passes
- existing play integration suite still passes
- build still succeeds

## Verification commands
- `npm test -- src/core/recording/recording-output.test.ts src/core/improve/improve.test.ts src/core/improve/improve-runner-support.test.ts src/app/services/record-service.test.ts`
- `npm run lint`
- `npm run lint:typed`
- `npm run typecheck:prod`
- `npm test`
- `npm run build`

## Acceptance evidence
- Fresh passing output from all commands above
- No TypeScript errors on touched files
- No behavior regressions in record/import/improve flows
- Docs remain consistent with current default behavior

## Non-goals
- New end-to-end coverage for every dynamic external site pattern
- Solving all remaining complexity in `src/core/improve/**` in one pass

## Risk-based priorities
1. Preserve behavior in record/import/improve defaults
2. Preserve type-safety under exact optional property typing
3. Preserve snapshot/index remapping correctness during step removal
4. Keep integration and build green while continuing cleanup
