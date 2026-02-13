# Troubleshooting

## Browser Installation Issues

### Chromium executable missing

Run:

```bash
npx playwright install chromium
```

### Linux shared dependencies missing

Run:

```bash
npx playwright install-deps chromium
```

## App Reachability Errors in `play`

If `play` cannot reach your app:
1. Verify `baseUrl` in `ui-test.config.yaml`.
2. Verify `startCommand` if auto-start is expected.
3. For manually started apps, run:

```bash
npx ui-test play --no-start
```

## Failure Artifacts Not Saved

By default, `play` saves failure artifacts (`failure-report.json`, `trace.zip`, `failure.png`).
When one or more tests fail in a run, it also saves `run-report.json`.

If artifacts are missing:
1. Ensure `artifactsDir` is writable.
2. Override output path for the run:

```bash
npx ui-test play --artifacts-dir ./tmp/ui-test-artifacts
```

3. If needed, disable capture for the run:

```bash
npx ui-test play --no-save-failure-artifacts
```

Open a saved trace:

```bash
npx playwright show-trace .ui-test-artifacts/runs/<runId>/tests/<testSlug>/trace.zip
```

## Recorder Produces No Interactions

- Ensure you actually click/type/interact before closing recording session.
- Re-run recording and verify browser window is used.
- Check for fallback diagnostics in CLI output.

You can force fallback mode for debugging:

```bash
UI_TEST_DISABLE_JSONL=1 npx ui-test record
```

## Improve Apply Mode Fails

If you see runtime validation errors:
- install Chromium (`npx playwright install chromium`)
- run without `--apply` or `--apply-assertions` for report-only mode

## Assertions Not Inserted by `improve`

If assertions were listed as candidates but not written to YAML:
1. Ensure you used `--apply-assertions`.
2. Keep `--assertions candidates` (not `--assertions none`).
3. Check report `assertionCandidates[].applyStatus` for skip reasons.
4. Re-run in a stable test environment so runtime validation can pass.

LLM is optional for assertion insertion. Deterministic assertion apply works with `--no-llm`.

## Local LLM Issues

If `--llm` fails:
1. Ensure Ollama is running.
2. Verify `llm.baseUrl` and `llm.model`.
3. Re-run without LLM:

```bash
npx ui-test improve e2e/login.yaml --no-llm
```

## Config Errors

### Legacy config filename detected

Only `ui-test.config.yaml` is supported.
Rename legacy files:
- `easy-e2e.config.yaml`
- `easy-e2e.config.yml`

## CI Runner Notes

For self-hosted runner fallback configuration, see [Maintainers](maintainers.md).
