# Maintainers

This guide covers maintainer-focused workflows and CI details.

## Test Commands

```bash
npm run setup
npm run lint
npm run lint:typed
npm run typecheck:prod
npm test
npm run quality:ci
npm run test:parity:headed
npm run test:coverage
npm run build
npm run test:smoke
```

`npm test` includes architecture boundary checks (see `src/architecture/layer-boundaries.test.ts`).

Optional strictness ratchet for tests:

```bash
npm run typecheck:test
```

`typecheck:test` is currently non-blocking in CI.

## Packaging Validation

Before publishing/consuming from a repo branch:

```bash
npm run build
npm run test:smoke
```

Release preflight:

```bash
npm pack --dry-run
```

## CI Runner

Workflows run on GitHub-hosted `ubuntu-latest` runners.

Primary CI workflow (`.github/workflows/ci.yml`) has these jobs:

- `quality-ci`: installs Chromium, runs `npm run quality:ci`, then `npm run test:coverage`.
- `headed-parity`: installs Chromium, runs `xvfb-run -a npm run test:parity:headed`.
- `build`: runs `npm run build`, `npm run typecheck:prod`, and packaging/install dry-run checks.
- `consumer-smoke`: runs `npm run test:smoke` after `quality-ci`, `headed-parity`, and `build` succeed.

## Recorder Stability Override

Recorder default path is JSONL with fallback to playwright-test parsing.
To force fallback mode:

```bash
UI_TEST_DISABLE_JSONL=1 ui-test record
```

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines: 82%
- Functions: 90%
- Branches: 65%
- Statements: 80%

See snapshot notes in `docs/test-coverage-report.md`.

## Legal / Notices

- Project license: MIT (`LICENSE`)
- Playwright attribution: `THIRD_PARTY_NOTICES.md`
