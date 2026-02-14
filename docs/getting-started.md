# Getting Started

This guide is for first-time `ui-test` users.

## Prerequisites

- Node.js 18+
- npm

## Install

If you are working in this repository:

```bash
npm run bootstrap
```

If you are adding `ui-test` to another project:

```bash
npm install --save-dev ui-test
```

## Setup

Repository checkout:

```bash
npm run bootstrap:setup
```

Npm consumer project:

```bash
npx ui-test setup
```

`setup` does the following:
1. Creates `ui-test.config.yaml` if missing.
2. Creates a sample test in your `testDir`.
3. Installs Playwright Chromium.
4. Verifies Chromium can launch.

## Run Tests

```bash
npx ui-test play
```

If your app is already running and you do not want auto-start:

```bash
npx ui-test play --no-start
```

`play` saves failure artifacts by default under `.ui-test-artifacts/`.
To disable this for a run:

```bash
npx ui-test play --no-save-failure-artifacts
```

## Initialize Manually

If you want interactive initialization choices:

```bash
npx ui-test init
```

Init modes:
- Built-in example app
- Already-running website
- Custom app with start command

## Typical First Session

Repository checkout:

```bash
npm run bootstrap:quickstart
```

Npm consumer project:

```bash
npx ui-test setup
npx ui-test play
npx ui-test record
npx ui-test play
```

## Next Steps

- Record tests: [Record Workflow](workflows/record.md)
- Improve selectors: [Improve Workflow](workflows/improve.md)
- Configure defaults: [Configuration](configuration.md)
