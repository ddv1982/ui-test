# Getting Started

This guide is for first-time `ui-test` users.

## Prerequisites

- Node.js 18+
- npm

## Pick Your Entry Path

### Repository checkout

```bash
npm run setup:quickstart
```

### Global install (standalone, current)

```bash
npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"
ui-test setup quickstart
```

### One-off run without global install (current)

```bash
npx -y github:ddv1982/easy-e2e-testing setup quickstart
```

Project dependency installs are intentionally unsupported.
All command examples below use global `ui-test`.

## Setup Modes

```bash
ui-test setup install
ui-test setup quickstart
ui-test setup quickstart --run-play
```

`setup quickstart` handles dependency install, Chromium provisioning, and optionally a first `play` run.

## Runtime Flags

Runtime controls are flags-first. Use:
- `ui-test play --help`
- `ui-test record --help`
- `ui-test improve --help`

## Run Tests

```bash
ui-test play
```

If your app is already running and you do not want auto-start:

```bash
ui-test play --no-start
```

## Record and Replay

```bash
ui-test record
ui-test play
```

## Improve Selector Quality

```bash
ui-test improve e2e/login.yaml
ui-test improve e2e/login.yaml --apply
```

For snapshot-cli assertions:

```bash
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
```

## Next Steps

- Record workflow: [Record Workflow](workflows/record.md)
- Improve workflow: [Improve Workflow](workflows/improve.md)
- Configuration reference: [Configuration](configuration.md)
