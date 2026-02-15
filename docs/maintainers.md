# Maintainers

This guide covers maintainer-focused workflows and CI details.

## Test Commands

```bash
npm run setup
npm run setup:quickstart
npm test
npm run lint
npm run lint:typed
npm run test:framework
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:coverage
```

`npm test` includes architecture boundary checks (see `src/architecture/layer-boundaries.test.ts`).

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

## CI Runner Selection

Configure one of the following repository variables:

- `CI_RUNNER_LABELS_JSON` (preferred): JSON array of labels, for example:
  - `["self-hosted"]`
  - `["self-hosted","macOS","ARM64"]`
- `CI_RUNNER_MODE=self-hosted` (fallback): strict labels `self-hosted`, `macOS`, `ARM64`

When neither is set, workflows default to `ubuntu-latest`.
The labels in `CI_RUNNER_LABELS_JSON` must exactly match labels on your registered runner(s), and those runners must be assigned to this repository through the right runner group/repo access settings.

## Recorder Stability Override

Recorder default path is JSONL with fallback to playwright-test parsing.
To force fallback mode:

```bash
UI_TEST_DISABLE_JSONL=1 ui-test record
```

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines: 60%
- Functions: 100%
- Branches: 50%
- Statements: 60%

See snapshot notes in `docs/test-coverage-report.md`.

## Legal / Notices

- Project license: MIT (`LICENSE`)
- Playwright attribution: `THIRD_PARTY_NOTICES.md`
