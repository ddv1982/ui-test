# Test Spec: ui-test deterministic recording and improve cleanup

## Scope
- Recording defaults and shared record/import output normalization
- Improve runner orchestration extraction
- Any new pure helper modules introduced during cleanup

## Required regression coverage
- Record profile defaults resolve to `report`
- Record service default auto-improve stays deterministic/review-first
- DevTools import still produces normalized YAML with derived baseUrl
- Shared recording-output helpers preserve navigation normalization and YAML emission
- Improve runner deterministic review path does not require Chromium
- Extracted improve helper modules preserve runtime-failure classification/removal behavior

## Verification commands
- `npm run lint`
- `npm run lint:typed`
- `npm run typecheck:prod`
- `npm test`
- `npm run build`

## Acceptance evidence
- Fresh command output from all verification commands
- Passing targeted unit tests for any extracted pure helpers
- Passing existing integration tests for improve/play flows

## Non-goals
- New browser-matrix or external-service coverage in this pass
- Broad snapshot-baseline changes unrelated to cleanup scope

## Risk-based priorities
1. Prevent behavior drift in improve runtime/replay logic
2. Preserve CLI defaults and backward compatibility
3. Keep cleanup modular so later passes can target `improve-assertion-pass` and `locator-repair`
