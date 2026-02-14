# Getting Started

This guide is for first-time `ui-test` users.

## Prerequisites

- Node.js 18+
- npm

## Pick Your Entry Path

### Repository checkout

```bash
npm run bootstrap:quickstart
```

### npm package consumer

```bash
npm install --save-dev ui-test
npx ui-test bootstrap quickstart
```

### GitHub one-off run (no checkout)

```bash
npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
```

### GitHub dependency install

```bash
npm install --save-dev github:ddv1982/easy-e2e-testing
npx ui-test bootstrap quickstart
```

## Bootstrap Modes

```bash
npx ui-test bootstrap install
npx ui-test bootstrap setup
npx ui-test bootstrap quickstart
npx ui-test bootstrap quickstart --run-play
npx ui-test bootstrap quickstart -- --skip-browser-install
```

`bootstrap quickstart` handles dependency install, setup, browser provisioning, and optionally a first `play` run.

To reconfigure an existing project interactively:

```bash
npx ui-test setup --reconfigure
```

## Run Tests

```bash
npx ui-test play
```

If your app is already running and you do not want auto-start:

```bash
npx ui-test play --no-start
```

## Record and Replay

```bash
npx ui-test record
npx ui-test play
```

## Improve Selector Quality

```bash
npx ui-test improve e2e/login.yaml
npx ui-test improve e2e/login.yaml --apply
```

For snapshot-cli assertions:

```bash
npx ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
```

## Next Steps

- Record workflow: [Record Workflow](workflows/record.md)
- Improve workflow: [Improve Workflow](workflows/improve.md)
- Configuration reference: [Configuration](configuration.md)
