# ui-test

`ui-test` is a YAML-first E2E runner built on Playwright.
Record flows, replay them, and improve selector/assertion quality with a review-first pipeline.

Note: `ui-test` uses the V2 `target` selector contract. Legacy `selector:` fields are not supported.

## Quick Start

### 1) Working inside this repository

```bash
npm run setup:quickstart
```

### 2) Global install (standalone, current)

```bash
npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"
ui-test setup quickstart
```

### 3) One-off run without global install (current)

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

Mode behavior:
1. `install`: installs project dependencies and verifies Playwright-CLI.
2. `quickstart` (default): runs `install` + Chromium provisioning, with optional first `play` run on `e2e/example.yaml`.

## Core Commands

| Command | Purpose |
| --- | --- |
| `ui-test setup [mode]` | Onboarding and provisioning helper |
| `ui-test play [test]` | Run one YAML test or all tests |
| `ui-test record` | Record browser interactions into YAML |
| `ui-test improve <file>` | Analyze and suggest selector/assertion improvements |
| `ui-test list` | List discovered tests |
| `ui-test doctor` | Show invocation/version diagnostics |

## Runtime Model (Flags-First)

Runtime behavior is controlled by built-in defaults and CLI flags.
Override per run with flags.

`play` defaults:
- headless (`--headed` opt-in)
- `--delay 0`
- `--wait-network-idle` enabled
- `testDir=e2e`
- `baseUrl=http://127.0.0.1:5173`
- `startCommand=ui-test example-app --host 127.0.0.1 --port 5173 || npx -y github:ddv1982/easy-e2e-testing example-app --host 127.0.0.1 --port 5173`
- network-idle wait uses Playwright default timeout behavior (`waitForLoadState("networkidle")` with no custom timeout)
- failure artifacts enabled to `.ui-test-artifacts`

Useful `play` flags:

```bash
ui-test play --headed
ui-test play --timeout 15000
ui-test play --delay 250
ui-test play --no-wait-network-idle
ui-test play --no-save-failure-artifacts
ui-test play --artifacts-dir ./tmp/ui-test-artifacts
ui-test play --no-start
```

`--no-start` note:
- built-in example app auto-start runs only when playing `e2e/example.yaml` (or a play-all run containing only that file)
- `--no-start` runs tests directly without default-URL preflight

Useful `record` and `improve` flags:

```bash
ui-test record --browser firefox --selector-policy raw
ui-test improve e2e/login.yaml --apply
ui-test improve e2e/login.yaml --assertions none --apply
ui-test improve e2e/login.yaml --assertion-source snapshot-cli
```

## Browser Provisioning Contract

Chromium provisioning is onboarding-only (`setup` modes).
`play`, `record`, and `improve` do not auto-install browsers.

If Chromium is missing, install with:

```bash
ui-test setup quickstart
# or
npx playwright install chromium
```

## Playwright-CLI Clarification

Playwright-CLI is only required for:

```bash
ui-test improve <file> --assertion-source snapshot-cli
```

Manual verify/install command:

```bash
playwright-cli --help
npx -y @playwright/cli@latest --help
```

## Troubleshooting

- Browser missing: `npx playwright install chromium`
- Linux dependencies missing: `npx playwright install-deps chromium`
- Example app not reachable (example test auto-start): verify `http://127.0.0.1:5173` or run `ui-test play --no-start`

Full guide: [Troubleshooting](docs/troubleshooting.md)

## Documentation

- [Getting Started](docs/getting-started.md)
- [Record Workflow](docs/workflows/record.md)
- [Improve Workflow](docs/workflows/improve.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Maintainers](docs/maintainers.md)

## Third-Party Licenses

`ui-test` uses Microsoft Playwright for automation/recording.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT
