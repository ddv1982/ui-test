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

### Global install (standalone, current)

```bash
npm i -g github:ddv1982/easy-e2e-testing
ui-test bootstrap quickstart
```

After npm publish is live, you can switch to:

```bash
npm i -g ui-test
```

### One-off run without global install (current)

```bash
npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
```

After npm publish is live:

```bash
npx ui-test bootstrap quickstart
```

Project dependency installs are intentionally unsupported.
All command examples below use global `ui-test`.

## Bootstrap Modes

```bash
ui-test bootstrap install
ui-test bootstrap setup
ui-test bootstrap quickstart
ui-test bootstrap quickstart --run-play
ui-test bootstrap quickstart -- --skip-browser-install
```

`bootstrap quickstart` handles dependency install, setup, browser provisioning, and optionally a first `play` run.

To reconfigure an existing project interactively:

```bash
ui-test setup --reconfigure
```

This flow updates runtime defaults (play + record) and does not ask app URL/start-command onboarding questions.

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
