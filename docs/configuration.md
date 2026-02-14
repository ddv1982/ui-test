# Configuration

Create `ui-test.config.yaml` in project root.

## Full Example

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: ui-test example-app --host 127.0.0.1 --port 5173 || npx -y github:ddv1982/easy-e2e-testing example-app --host 127.0.0.1 --port 5173
headed: false
timeout: 10000
delay: 0
waitForNetworkIdle: true
networkIdleTimeout: 2000
saveFailureArtifacts: true
artifactsDir: .ui-test-artifacts
recordSelectorPolicy: reliable
recordBrowser: chromium
recordDevice: iPhone 13
recordTestIdAttribute: data-testid
recordLoadStorage: .auth/in.json
recordSaveStorage: .auth/out.json
improveApplyMode: review
improveApplyAssertions: false
improveAssertionSource: snapshot-native
improveAssertionApplyPolicy: reliable
improveAssertions: candidates
```

## Fields

### Core Play Settings
- `testDir`: directory to discover YAML tests.
- `baseUrl`: base URL used for relative navigations.
- `startCommand`: app startup command used by `play` auto-start.
- `headed`: run browser visibly.
- `timeout`: per-step timeout in milliseconds.
- `delay`: delay between steps in milliseconds.
- `waitForNetworkIdle`: wait for network idle after each step.
- `networkIdleTimeout`: timeout for post-step network idle wait.
  - `setup --reconfigure` lets you toggle `waitForNetworkIdle` but keeps `networkIdleTimeout` as an advanced manual config key.
- `saveFailureArtifacts`: save JSON report + trace + screenshot when a play run fails.
- `artifactsDir`: base directory for play failure artifacts (default `.ui-test-artifacts`).

### Failure Artifact Output Layout
- Per failed test:
  - `<artifactsDir>/runs/<runId>/tests/<testSlug>/failure-report.json`
  - `<artifactsDir>/runs/<runId>/tests/<testSlug>/trace.zip`
  - `<artifactsDir>/runs/<runId>/tests/<testSlug>/failure.png`
- Per failing run:
  - `<artifactsDir>/runs/<runId>/run-report.json`

### Record Defaults
- `recordSelectorPolicy`: `reliable` or `raw`.
- `recordBrowser`: `chromium`, `firefox`, or `webkit`.
- `recordDevice`: Playwright device name.
- `recordTestIdAttribute`: custom test-id attribute.
- `recordLoadStorage`: preload storage state path.
- `recordSaveStorage`: save resulting storage state path.

### Improve Defaults
- `improveApplyMode`: `review` or `apply`. Controls selector auto-apply. Note: CLI `--apply` enables both selectors and assertions; config keys control each independently.
- `improveApplyAssertions`: apply high-confidence assertion candidates when improve runs.
- `improveAssertionSource`: `snapshot-native` (default, native aria snapshot mode), `deterministic` (form-state only), or `snapshot-cli` (external Playwright-CLI snapshot mode).
- `improveAssertionApplyPolicy`: `reliable` (default) or `aggressive`.
  - `reliable`: snapshot-derived `assertVisible` is report-only.
  - `aggressive`: snapshot-derived `assertVisible` can be auto-applied after runtime validation.
- `improveAssertions`: `none` or `candidates`.
- `improveProvider`: removed; if present in config, improve will raise a migration error.
- `llm`: removed; if present in config, improve will raise a migration error.

## Command Overrides

CLI flags override config values for each run.

Examples:

```bash
ui-test play --headed --timeout 15000
ui-test play --save-failure-artifacts
ui-test play --artifacts-dir ./tmp/ui-test-artifacts --no-save-failure-artifacts
ui-test record --browser firefox --selector-policy raw
ui-test improve e2e/login.yaml --apply
ui-test improve e2e/login.yaml --apply-selectors
ui-test improve e2e/login.yaml --apply-assertions
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-native
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
ui-test improve e2e/login.yaml --apply --assertion-apply-policy aggressive
ui-test doctor
```

## V2 YAML Step Contract

Selector-based actions use `target`:

```yaml
- action: click
  target:
    value: "getByRole('button', { name: 'Save' })"
    kind: locatorExpression
    source: manual
```

Supported `target.kind`:
- `locatorExpression`
- `playwrightSelector`
- `css`
- `xpath`
- `internal`
- `unknown`
