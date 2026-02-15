# Troubleshooting

## Setup Issues

### `ui-test setup` (or repo `npm run setup:*`) fails

1. Verify Node.js version (`node -v`) is 18 or newer.
2. Verify npm and npx are available in PATH (`npm -v`, `npx -v`).
3. Re-run with explicit steps for your context:

```bash
# repo checkout
npm run setup
npm run setup:quickstart

# standalone CLI (global install)
ui-test setup install
ui-test setup quickstart
```

Install globally if not yet installed (current):

```bash
npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"
```

If you are using one-off execution (current):

```bash
npx -y github:ddv1982/easy-e2e-testing setup quickstart
```

If you see `Standalone install policy: project-local installs are not supported`, use this cleanup flow:
1. Remove `ui-test` from `dependencies`/`devDependencies` in `package.json`.
2. Run `npm uninstall ui-test`.
3. Run `npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"`.
4. Re-run `ui-test setup quickstart`.

If Playwright-CLI install/verify fails during setup, it is reported as a warning and setup continues. `playwright-cli` is only required for:

```bash
ui-test improve <file> --assertion-source snapshot-cli
```

## Browser Installation Issues

### Chromium executable missing

Run:

```bash
npx playwright install chromium
```

Or run onboarding again:

```bash
ui-test setup quickstart
```

### Linux shared dependencies missing

On Linux, run:

```bash
npx playwright install-deps chromium
```

## App Reachability Errors in `play`

If `play` cannot reach your app:
1. Verify `baseUrl` in `ui-test.config.yaml`.
2. Verify `startCommand` if auto-start is expected.
3. For manually started apps, run:

```bash
ui-test play --no-start
```

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

- Ensure you actually click/type/interact before closing recording session.
- Re-run recording and verify browser window is used.
- Check for fallback diagnostics in CLI output.

You can force fallback mode for debugging:

```bash
UI_TEST_DISABLE_JSONL=1 ui-test record
```

## Improve Apply Mode Fails

If you see runtime validation errors:
- install Chromium (`npx playwright install chromium`)
- rerun with `ui-test setup quickstart` if needed

## Assertions Not Inserted by `improve`

If assertions were listed as candidates but not written to YAML:
1. Ensure you used `--apply` or `--apply-assertions`.
2. Keep `--assertions candidates` (not `--assertions none`). If `--apply` is used with `--assertions none`, assertion apply is downgraded.
3. Check report `assertionCandidates[].applyStatus` for skip reasons.
4. Re-run in a stable test environment so runtime validation can pass.
5. Note: with `--assertion-source deterministic`, click/press assertions are intentionally not auto-generated and auto-apply targets stable form-state checks (`assertValue`/`assertChecked`). The default source (`snapshot-native`) generates assertions from page state changes.
6. If you use `--assertion-source snapshot-native` or `--assertion-source snapshot-cli`, improve can propose snapshot-derived `assertVisible`/`assertText` candidates. In apply mode, snapshot-derived `assertVisible` is report-only (`skipped_policy`), while snapshot-derived `assertText` can be inserted after runtime validation.
7. Runtime-failing assertion candidates are never force-applied. If they fail validation, they are reported as `skipped_runtime_failure`.
8. Apply mode limits inserted assertions to one applied assertion per source step; additional candidates are reported as `skipped_policy`.
9. Improve does not inject coverage fallback assertions.
10. Existing adjacent self-visibility assertions are preserved (no automatic cleanup).
11. If CLI behavior seems different from local source, check for warning about binary path outside workspace. Use local build explicitly:

```bash
node dist/bin/ui-test.js improve <test-file> --apply
```

You can inspect invocation/version details explicitly:

```bash
ui-test doctor
```

Validation timing mirrors `play` post-step waiting (network idle with Playwright default timeout behavior). If that wait times out, candidates are skipped with `skipped_runtime_failure`.

## Snapshot Assertion Source Fallback

### snapshot-native

If you run `--assertion-source snapshot-native` and get no snapshot-driven candidates:
1. Ensure Chromium is installed (`npx playwright install chromium`).
2. Check report diagnostics for `assertion_source_snapshot_native_empty` or `assertion_source_snapshot_native_parse_failed`.
3. Improve falls back to deterministic assertion candidates by design.

### snapshot-cli

If you run `--assertion-source snapshot-cli` and get no snapshot-driven candidates:
1. Verify `playwright-cli` or `npx -y @playwright/cli@latest --help` is available.
2. Check report diagnostics for `assertion_source_snapshot_cli_unavailable` or `assertion_source_snapshot_cli_step_replay_failed`.
3. Improve falls back to deterministic assertion candidates by design (`assertion_source_snapshot_cli_fallback`).

## Config Errors

Only `ui-test.config.yaml` is supported.
Unknown keys fail validation.

If validation fails:
1. Remove unsupported keys.
2. Keep only canonical keys (`testDir`, `baseUrl`, `startCommand`, improve defaults).
