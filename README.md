# ui-test

`ui-test` is a YAML-first E2E test runner built on Playwright.
You can record tests, replay them, and optionally improve selector quality with a review-first pipeline.

Note: `ui-test` uses the V2 `target` selector contract. Legacy `selector:` fields are not supported.

## 5-Minute Quickstart

```bash
npm install --save-dev .
npx ui-test setup
npx ui-test play
```

What this does:
1. Creates `ui-test.config.yaml` (if missing).
2. Installs Chromium for Playwright.
3. Runs example YAML tests from `e2e/`.

## Choose Your Path

### Beginner: run tests quickly

Use defaults and run:

```bash
npx ui-test setup
npx ui-test play
```

If your app is already running:

```bash
npx ui-test play --no-start
```

Disable failure artifact capture for a run:

```bash
npx ui-test play --no-save-failure-artifacts
```

Re-enable capture explicitly for a run:

```bash
npx ui-test play --save-failure-artifacts
```

Use a custom artifact directory:

```bash
npx ui-test play --artifacts-dir ./tmp/ui-test-artifacts
```

See: [Getting Started](docs/getting-started.md)

### Intermediate: record and replay your own tests

```bash
npx ui-test record
npx ui-test list
npx ui-test play
```

Recommended flow:
1. Record a scenario.
2. Open the YAML file and add assertions.
3. Re-run with `npx ui-test play`.

See: [Record Workflow](docs/workflows/record.md)

### Advanced: improve selector quality

```bash
npx ui-test improve e2e/login.yaml
npx ui-test improve e2e/login.yaml --apply
npx ui-test improve e2e/login.yaml --apply-assertions
```

Optional local LLM ranking (Ollama):

```bash
npx ui-test improve e2e/login.yaml --llm
```

See: [Improve Workflow](docs/workflows/improve.md)

## Core Commands

| Command | Purpose |
| --- | --- |
| `npx ui-test setup` | Initialize config and install browser dependencies |
| `npx ui-test play [test]` | Run one YAML test or all tests |
| `npx ui-test record` | Record browser interactions into YAML |
| `npx ui-test improve <file>` | Analyze selector quality and produce report |
| `npx ui-test list` | List discovered tests |

More flags:
- `npx ui-test --help`
- `npx ui-test record --help`
- `npx ui-test play --help`
- `npx ui-test improve --help`

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

See full schema examples in [Configuration & Schema](docs/configuration.md).

## Minimal Configuration

Create `ui-test.config.yaml`:

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
improveProvider: auto
improveApplyMode: review
improveApplyAssertions: false
improveAssertions: candidates
llm:
  enabled: false
  provider: ollama
  baseUrl: http://127.0.0.1:11434
  model: gemma3:4b
```

`startCommand` is optional. If omitted, start your app manually and run `npx ui-test play --no-start`.

See all options in [Configuration](docs/configuration.md).

## Failure Artifacts

By default, `npx ui-test play` captures failure artifacts.

Per failed test:
- `<artifactsDir>/runs/<runId>/tests/<testSlug>/failure-report.json`
- `<artifactsDir>/runs/<runId>/tests/<testSlug>/trace.zip`
- `<artifactsDir>/runs/<runId>/tests/<testSlug>/failure.png`

Per failing run:
- `<artifactsDir>/runs/<runId>/run-report.json`

When a run fails, CLI output includes:
- `Failure artifacts index: .../run-report.json`
- `Open trace: npx playwright show-trace .../trace.zip`

## Recorder & Improve Reliability Model

### Recorder
- Primary capture: Playwright JSONL codegen.
- Fallback capture: `--target playwright-test` + constrained AST parser.
- Output includes selector quality summary (`stable`, `fallback`, `frame-aware`).

### Improve
- Default mode is review-first: writes report only.
- `--apply` writes recommended selector updates.
- `--apply-assertions` writes high-confidence, runtime-validated assertion candidates.
- Runtime validation is required for apply mode.
- Optional Ollama ranking is best-effort; deterministic scoring/apply remain available with `--no-llm`.

## Quick Troubleshooting

- Browser missing:
  - `npx playwright install chromium`
- Linux dependencies missing:
  - `npx playwright install-deps chromium`
- App not reachable in play mode:
  - verify `baseUrl`, or run `--no-start` with app already running
- Failure artifacts not written:
  - verify `artifactsDir` permissions, or use `--artifacts-dir` with a writable path
- Legacy config file error:
  - rename to `ui-test.config.yaml`

More: [Troubleshooting](docs/troubleshooting.md)

## Documentation Map

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
