# Troubleshooting

## Setup Issues

### `ui-test setup` (or repo `npm run setup` / `npm run setup:play`) fails

1. Verify Node.js 18+ (`node -v`) and npm (`npm -v`).
2. Follow the install steps in [Getting Started](getting-started.md).

If you see `Standalone install policy: project-local installs are not supported`:
1. Remove `ui-test` from `dependencies`/`devDependencies` in `package.json`.
2. Run `npm uninstall ui-test`.
3. Run `npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"`.
4. Re-run `ui-test setup`.

Playwright-CLI is only needed for `--assertion-source snapshot-cli`. If its install fails during setup, setup continues with a warning.

## Browser Installation Issues

### Chromium executable missing

```bash
npx playwright install chromium
```

### Linux shared dependencies missing

On Linux, run:

```bash
npx playwright install-deps chromium
```

## App Reachability Errors in `play`

If `play e2e/example.yaml` cannot reach the app:
1. Verify the example app is running at `http://127.0.0.1:5173`.
2. If you start the app manually, run `ui-test play --no-start`.

Auto-start only applies to `e2e/example.yaml`. For other tests, start your app manually and use `--no-start`.

## Failure Artifacts Not Saved

By default, `play` saves failure artifacts (`failure-report.json`, `trace.zip`, `failure.png`).
When one or more tests fail in a run, it also saves `run-report.json`.

If artifacts are missing:
1. Ensure `artifactsDir` is writable.
2. Override output path for the run:

```bash
ui-test play --artifacts-dir ./tmp/ui-test-artifacts
```

3. If needed, disable capture for the run:

```bash
ui-test play --no-save-failure-artifacts
```

Open a saved trace:

```bash
npx playwright show-trace .ui-test-artifacts/runs/<runId>/tests/<testSlug>/trace.zip
```

## Recorder Produces No Interactions

- Ensure you actually click/type/interact before closing the recording session.
- Re-run recording and verify the browser window is used.
- Check for fallback diagnostics in CLI output.

## Improve Apply Mode Fails

If you see runtime validation errors:
- Install Chromium (`npx playwright install chromium`).
- Re-run with `ui-test setup` if needed.

## Assertions Not Inserted by `improve`

### Common causes

1. Use `--apply` — without it, improve writes a report only.
2. Use `--assertions candidates` (not `none`) — with `none`, assertion generation is skipped.
3. Check the report's `applyStatus` for skip reasons (see [Improve Workflow](workflows/improve.md#report-contents)).
4. Re-run in a stable environment so runtime validation can pass.

### Additional causes

- **Deterministic source**: only generates `assertValue` (for fill/select) and `assertChecked` (for check/uncheck). Click/press assertions are intentionally not auto-generated.
- **Snapshot `assertVisible`** is report-only. Snapshot `assertText` can be inserted after runtime validation.
- **One assertion per step**: extras show as `skipped_policy`.
- **Version mismatch?** Run `ui-test doctor` to check invocation/version details.

If CLI behavior seems different from local source, check for warnings about binary path outside workspace:

```bash
node dist/bin/ui-test.js improve <test-file> --apply
```

## Snapshot Assertion Source Fallback

### snapshot-native

If `--assertion-source snapshot-native` produces no snapshot-driven candidates:
1. Ensure Chromium is installed (`npx playwright install chromium`).
2. Check report diagnostics:
   - `assertion_source_snapshot_native_empty` — no page state changes detected
   - `assertion_source_snapshot_native_parse_failed` — snapshot could not be parsed
3. Improve falls back to deterministic assertion candidates by design.

### snapshot-cli

If `--assertion-source snapshot-cli` produces no snapshot-driven candidates:
1. Verify `playwright-cli` is available (`playwright-cli --help` or `npx -y @playwright/cli@latest --help`).
2. Check report diagnostics:
   - `assertion_source_snapshot_cli_unavailable` — Playwright-CLI not installed
   - `assertion_source_snapshot_cli_step_replay_failed` — step replay failed in CLI process
   - `assertion_source_snapshot_cli_fallback` — fell back to deterministic candidates
3. Improve falls back to deterministic assertion candidates by design.
