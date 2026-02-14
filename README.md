# ui-test

`ui-test` is a YAML-first E2E runner built on Playwright.
Record flows, replay them, and improve selector/assertion quality with a review-first pipeline.

Note: `ui-test` uses the V2 `target` selector contract. Legacy `selector:` fields are not supported.

## Quick Start

### 1) Working inside this repository

```bash
npm run bootstrap:quickstart
```

### 2) Global install (standalone)

```bash
npm i -g ui-test
ui-test bootstrap quickstart
```

### 3) One-off run without global install

```bash
npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
```

Project dependency installs are intentionally unsupported.
All command examples below use global `ui-test`; for one-off usage today, replace with
`npx -y github:ddv1982/easy-e2e-testing <command>`.

## What `bootstrap quickstart` Does

1. Installs dependencies (`npm ci` when `package-lock.json` exists, otherwise `npm install`).
2. Installs/verifies Playwright-CLI (`playwright-cli` first, then `npx -y @playwright/cli@latest` fallback).
3. Creates `ui-test.config.yaml` and a sample test (if missing).
4. Installs Chromium and verifies it can launch.
5. Optionally runs `ui-test play` when `--run-play` is provided.

Use modes explicitly when needed:

```bash
ui-test bootstrap install
ui-test bootstrap setup
ui-test bootstrap quickstart --run-play
ui-test bootstrap quickstart -- --skip-browser-install
```

Fallback for one-off execution:

```bash
npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `ui-test bootstrap [mode]` | Onboarding/install/setup/play helper |
| `ui-test setup` | Initialize config + browser dependencies |
| `ui-test play [test]` | Run one YAML test or all tests |
| `ui-test record` | Record browser interactions into YAML |
| `ui-test improve <file>` | Analyze and suggest selector/assertion improvements |
| `ui-test list` | List discovered tests |
| `ui-test doctor` | Show invocation/version diagnostics |

Reconfigure settings later (interactive):

```bash
ui-test setup --reconfigure
```

`setup --reconfigure` updates runtime defaults (play + record) without re-running URL/start-command onboarding.

## Typical Workflow

### Record and replay

```bash
ui-test record
ui-test list
ui-test play
```

### Improve selectors/assertions (review-first)

```bash
ui-test improve e2e/login.yaml
ui-test improve e2e/login.yaml --apply
ui-test improve e2e/login.yaml --apply-selectors
ui-test improve e2e/login.yaml --apply-assertions
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-native
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
ui-test improve e2e/login.yaml --apply --assertion-apply-policy aggressive
```

Defaults:
- Improve is deterministic and review-first.
- Snapshot-native is the default assertion source.
- Snapshot-cli is optional and requires Playwright-CLI.

## Test Format (V2)

```yaml
name: Login Test
baseUrl: https://example.com
steps:
  - action: navigate
    url: /login

  - action: fill
    target:
      value: "#email"
      kind: css
      source: manual
    text: user@example.com

  - action: click
    target:
      value: "getByRole('button', { name: 'Sign in' })"
      kind: locatorExpression
      source: manual
```

Selector-based steps use:

```yaml
target:
  value: "..."
  kind: locatorExpression | playwrightSelector | css | xpath | internal | unknown
  source: manual | codegen-jsonl | codegen-fallback
```

## Minimal Configuration

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: npm run dev
headed: false
timeout: 10000
saveFailureArtifacts: true
artifactsDir: .ui-test-artifacts
recordSelectorPolicy: reliable
recordBrowser: chromium
improveApplyMode: review
improveApplyAssertions: false
improveAssertionSource: snapshot-native
improveAssertionApplyPolicy: reliable
improveAssertions: candidates
```

`startCommand` is optional. If omitted, start your app manually and run:

```bash
ui-test play --no-start
```

## Playwright-CLI Clarification

Playwright-CLI is only required for:

```bash
ui-test improve <file> --assertion-source snapshot-cli
```

It is not required for default `setup`, `play`, `record`, or default `improve`.

Manual verify/install command:

```bash
playwright-cli --help
npx -y @playwright/cli@latest --help
```

## Troubleshooting

- Browser missing: `npx playwright install chromium`
- Linux dependencies missing: `npx playwright install-deps chromium`
- App not reachable: verify `baseUrl` or run `ui-test play --no-start`
- Config filename must be `ui-test.config.yaml`

Full guide: [Troubleshooting](docs/troubleshooting.md)

## Documentation

- [Getting Started](docs/getting-started.md)
- [Record Workflow](docs/workflows/record.md)
- [Improve Workflow](docs/workflows/improve.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Maintainers](docs/maintainers.md)

## Third-Party Licenses

`ui-test` uses Microsoft Playwright for automation/recording.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT
