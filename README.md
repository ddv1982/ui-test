# ui-test

No-code E2E testing framework - record and replay browser tests with YAML.

Note: selector steps now use the V2 `target` object contract. Legacy `selector:` step fields are not supported.

## Installation

```bash
# from this repo (local)
npm install --save-dev .

# from GitHub
npm install --save-dev github:ddv1982/easy-e2e-testing#main
```

`ui-test` is not currently published to npm with installable versions, so
`npm install --save-dev ui-test` will fail until the package is published.

## Quick Start

### 1. Install and run setup

```bash
npm install --save-dev .
npx ui-test setup
```

`setup` creates config/sample files (if needed) and installs Chromium for Playwright.
No Git Bash is required on Windows for this flow.

Need command help?

```bash
npx ui-test help
npx ui-test --help
```

Default generated values for the built-in Vue example app:

- `baseUrl`: `http://127.0.0.1:5173`
- `startCommand`: `npx ui-test example-app --host 127.0.0.1 --port 5173`

### Init Modes (Interactive `npx ui-test init`)

`init` now asks what you are testing and only configures `startCommand` when relevant:

- `Built-in example app` (default): auto-generates `startCommand`.
- `Already-running website`: no `startCommand` is written.
- `Custom app with start command`: prompts for command and stores it.

### 2. Run tests (one command)

```bash
npx ui-test play
```

`play` auto-starts the app when `startCommand` is present in `ui-test.config.yaml`.

### 3. Optional manual mode

If you already started the app yourself:

```bash
npx ui-test example-app --host 127.0.0.1 --port 5173
npx ui-test play --no-start
```

### 4. Record a test

```bash
npx ui-test record
```

### 5. List tests

```bash
npx ui-test list
```

## Command Matrix

| Command | What it runs | Main audience |
| --- | --- | --- |
| `npx ui-test help` | Full CLI command help | End users and maintainers |
| `npx ui-test setup` | First-run project setup (config + browser install) | End users onboarding quickly |
| `npx ui-test play` | YAML browser tests from `testDir` | End users testing an app |
| `npm test` | Vitest framework suite (unit + integration in `src/**/*.test.ts` and `src/**/*.integration.test.ts`) | Maintainers of `ui-test` |
| `npm run test:smoke` | Consumer-style packaged smoke (`setup` -> `play`) | Maintainers validating onboarding |
| `npm run help` | Friendly repo-local command guide | Maintainers working in this repository |

For installed usage in your own app, use `npx ui-test help` or `npx ui-test --help`.

## Common Confusion

If you run `npm test`, you will **not** see your YAML `headed` browser flow.  
`npm test` runs framework tests; YAML browser playback is run via `npx ui-test play`.

`headed` and `delay` are read from `ui-test.config.yaml` (or CLI flags) when running:

- `npx ui-test play`
- `npx ui-test play --headed --delay 2000`

`ui-test play` also waits for `networkidle` after each step by default to reduce flaky timing issues.
If idle is not reached before timeout, it warns and continues.
Repeated timeout warnings are capped per test file to keep logs readable.

## Troubleshooting Setup

- Linux browser dependency issue: if setup reports missing dependencies, run `npx playwright install-deps chromium`.
- Proxy/firewall environments: browser download may fail if outbound access is blocked; configure npm/proxy settings and rerun `npx ui-test setup`.
- Legacy config file detected: `easy-e2e.config.yaml` is no longer supported. Rename it to `ui-test.config.yaml`.

## Test Format

Tests are written in YAML with a simple, readable format:

```yaml
name: Login Test
description: Test user login flow
baseUrl: https://example.com

steps:
  - action: navigate
    url: /login

  - action: fill
    target:
      value: '#username'
      kind: css
      source: manual
    text: testuser

  - action: fill
    target:
      value: '#password'
      kind: css
      source: manual
    text: password123

  - action: click
    target:
      value: 'button[type=submit]'
      kind: css
      source: manual

  - action: assertVisible
    target:
      value: '.dashboard'
      kind: css
      source: manual
    description: User is logged in
```

## Available Actions

- `navigate` - Navigate to URL
- `click` - Click element
- `fill` - Fill input field
- `press` - Press keyboard key
- `check` - Check checkbox
- `uncheck` - Uncheck checkbox
- `hover` - Hover over element
- `select` - Select dropdown option
- `assertVisible` - Assert element is visible
- `assertText` - Assert element contains text
- `assertValue` - Assert input has value
- `assertChecked` - Assert checkbox is checked

## Selector Syntax

Each selector-based step uses:

```yaml
target:
  value: "getByRole('button', { name: 'Save' })"
  kind: locatorExpression
  source: manual
```

`target.kind` supports:

- `locatorExpression`
- `playwrightSelector`
- `css`
- `xpath`
- `internal`
- `unknown`

Selector strategy ladder used by recorder:

- Prefer normalized locator expressions from Playwright JSONL (`reliable` policy)
- Preserve raw Playwright selectors with metadata fallback when normalization is not possible
- Fall back to parsing `--target playwright-test` output when JSONL is unavailable

`ui-test` validates locator expressions with a strict allowlist and rejects arbitrary JavaScript execution.

## Configuration

Create `ui-test.config.yaml`:

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: npx ui-test example-app --host 127.0.0.1 --port 5173
headed: false
timeout: 10000
delay: 2000 # optional; milliseconds between steps
waitForNetworkIdle: true # optional; default true
networkIdleTimeout: 2000 # optional; milliseconds, default 2000
recordSelectorPolicy: reliable # optional; reliable|raw
recordBrowser: chromium # optional; chromium|firefox|webkit
recordDevice: iPhone 13 # optional
recordTestIdAttribute: data-testid # optional
recordLoadStorage: .auth/in.json # optional
recordSaveStorage: .auth/out.json # optional
```

`startCommand` is optional and only needed if you want `ui-test play` to auto-start your app.
If omitted, start your app manually and run `npx ui-test play --no-start`.

Runtime overrides:

- Disable post-step network-idle waits: `npx ui-test play --no-wait-network-idle`
- Tune timeout: `npx ui-test play --network-idle-timeout 3500`

Record overrides:

- `npx ui-test record --selector-policy reliable`
- `npx ui-test record --browser firefox`
- `npx ui-test record --device "iPhone 13"`
- `npx ui-test record --test-id-attribute data-qa`
- `npx ui-test record --load-storage .auth/in.json --save-storage .auth/out.json`

Recorder reliability behavior:

- Primary path: Playwright codegen JSONL capture
- Fallback path: Playwright `--target playwright-test` + constrained AST parser
- CLI prints whether fallback/degraded fidelity was used and selector quality counts

## Development

### Running Tests

```bash
# Framework tests (maintainer suite)
npm test
npm run test:framework

# Consumer onboarding smoke (pack -> install -> setup -> play)
npm run test:smoke

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Check npm package name availability before publishing
npm run check:npm-name
```

### CI Runner Fallback

If GitHub-hosted runners are unavailable (for example billing/spending-limit issues), set a repository or organization variable so CI runs on self-hosted runners:

- `CI_RUNNER_MODE=self-hosted`

When this variable is set, CI targets strict labels:

- `["self-hosted","macOS","ARM64"]`

When not set (or set to anything else), CI defaults to `ubuntu-latest`.

### Recorder Stability Override

The recorder uses Playwright JSONL capture first when available, with fallback to `playwright-test` parsing.

To force stable fallback mode (skip JSONL entirely), set:

- `UI_TEST_DISABLE_JSONL=1`

### Test Coverage

Coverage thresholds are enforced in [vitest.config.ts](vitest.config.ts):

- **Lines:** 60%
- **Functions:** 100%
- **Branches:** 50%
- **Statements:** 60%

Run `npm run test:coverage` for current local metrics.  
See [docs/test-coverage-report.md](docs/test-coverage-report.md) for the latest recorded snapshot.

## License

MIT
