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

## Auto-Improve After Recording Fails

If auto-improve fails after recording, the recording is still saved. The CLI prints a warning with a manual command to retry.

Common causes:
- Chromium not installed — run `npx playwright install chromium`.
- The recorded test references a URL that is no longer reachable.

Fix the underlying issue, then run the improve step manually:

```bash
ui-test improve <file> --apply
```

## Headed vs Headless Differences on Dynamic Sites

Dynamic news pages can behave differently between headed and headless runs when overlays or fast-changing headlines are present.

Current stability-first behavior:
- `play` registers targeted Playwright locator handlers (`page.addLocatorHandler`) for consent and known non-cookie modal roots, and removes handlers after the run.
- `play` attempts targeted pre-step dismissal for cookie consent and known non-cookie blocking modals (for example breaking-push style dialogs).
- If a click fails with overlay interception, `play` performs one guarded retry after targeted overlay dismissal.
- `record`/normalization in reliable mode drops `exact: true` for dynamic headline-like locator text.
- `improve` attempts Playwright runtime selector regeneration for dynamic-flagged/brittle targets, but only adopts candidates with unique runtime match.
- `improve` skips deterministic post-click `assertVisible` fallback assertions for navigation-like dynamic link clicks and favors URL/title/snapshot-native candidates when available.

Useful diagnostics to confirm behavior:
- `overlay_dismissed_non_cookie`
- `deterministic_assertion_skipped_navigation_like_click`
- `selector_repair_adopted_on_tie_for_dynamic_target`
- `selector_repair_generated_via_playwright_runtime`
- `selector_repair_playwright_runtime_unavailable`
- `selector_repair_playwright_runtime_non_unique`
- `selector_repair_playwright_runtime_conversion_failed`
- `selector_repair_playwright_runtime_disabled`
- `selector_repair_playwright_runtime_private_fallback_disabled`
- `selector_repair_playwright_runtime_private_fallback_used`

If your test still flakes:
1. Re-run with traces enabled (default artifact capture) and inspect the failing step:
   - `npx playwright show-trace .ui-test-artifacts/runs/<runId>/tests/<testSlug>/trace.zip`
2. Re-run improve in apply mode:
   - `ui-test improve <file> --apply`
3. Prefer stable semantic targets (roles/test ids/nav labels) over long, exact headline text.
4. If needed, disable runtime regeneration temporarily to isolate behavior:
   - `UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN=1 ui-test improve <file> --apply`
5. If needed, keep public runtime conversion but disable private resolver fallback:
   - `UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_PRIVATE_FALLBACK=1 ui-test improve <file> --apply`

Runtime regeneration diagnostic meanings:
1. `selector_repair_playwright_runtime_unavailable`: runtime resolver or uniqueness check could not run in this environment.
2. `selector_repair_playwright_runtime_non_unique`: runtime match count was not unique, so no repair was generated.
3. `selector_repair_playwright_runtime_disabled`: runtime regeneration was explicitly disabled by env var.
4. `selector_repair_playwright_runtime_private_fallback_disabled`: private resolver fallback was explicitly disabled by env var.
5. `selector_repair_playwright_runtime_private_fallback_used`: fallback path was used after public conversion was unavailable.

## Improve Apply Mode Fails

If you see runtime validation errors:
- Install Chromium (`npx playwright install chromium`).
- Re-run with `ui-test setup` if needed.

## Assertions Not Inserted by `improve`

### Common causes

1. Use `--apply` or accept the interactive prompt — with `--no-apply`, improve writes a report only.
2. Use `--assertions candidates` (not `none`) — with `none`, assertion generation is skipped.
3. Check the report's `applyStatus` for skip reasons (see [Improve Workflow](workflows/improve.md#report-contents)).
4. Re-run in a stable environment so runtime validation can pass.

### Additional causes

- **Deterministic source**: generates `assertValue` (fill/select), `assertChecked` (check/uncheck), and low-priority coverage fallback `assertVisible` candidates for click/press/hover interactions.
- **Snapshot source**: `assertVisible` is policy-driven (`reliable`: stable-structural only; `balanced`/`aggressive`: runtime-validated). `assertText` can be inserted after runtime validation.
- **Assertion cap**: apply cap is policy-driven (`reliable=1`, `balanced=2`, `aggressive=3`) per source step; extras show as `skipped_policy`.
- **Legacy YAML**: `optional: true` is no longer supported on steps. Remove this field from existing tests.
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
