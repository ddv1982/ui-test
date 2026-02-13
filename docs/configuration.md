# Configuration

Create `ui-test.config.yaml` in project root.

## Full Example

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: npx ui-test example-app --host 127.0.0.1 --port 5173
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
improveProvider: auto
improveApplyMode: review
improveApplyAssertions: false
improveAssertions: candidates
llm:
  enabled: false
  provider: ollama
  baseUrl: http://127.0.0.1:11434
  model: gemma3:4b
  timeoutMs: 12000
  temperature: 0
  maxOutputTokens: 600
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
- `improveProvider`: `auto`, `playwright`, `playwright-cli`.
- `improveApplyMode`: `review` or `apply`.
- `improveApplyAssertions`: apply high-confidence assertion candidates when improve runs.
- `improveAssertions`: `none` or `candidates`.

### LLM Settings (Optional)
- `llm.enabled`: enable local LLM ranking.
- `llm.provider`: currently `ollama`.
- `llm.baseUrl`: Ollama base URL.
- `llm.model`: default `gemma3:4b`.
- `llm.timeoutMs`: request timeout.
- `llm.temperature`: sampling temperature.
- `llm.maxOutputTokens`: output token budget.

## Command Overrides

CLI flags override config values for each run.

Examples:

```bash
npx ui-test play --headed --timeout 15000
npx ui-test play --save-failure-artifacts
npx ui-test play --artifacts-dir ./tmp/ui-test-artifacts --no-save-failure-artifacts
npx ui-test record --browser firefox --selector-policy raw
npx ui-test improve e2e/login.yaml --no-llm --apply
npx ui-test improve e2e/login.yaml --apply-assertions
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
