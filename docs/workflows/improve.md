# Improve Workflow

`improve` is a post-processing step for recorded YAML tests.

## Default (Review First)

```bash
ui-test improve e2e/login.yaml
```

This writes a JSON report and does not modify YAML.

## Apply All Improvements

```bash
ui-test improve e2e/login.yaml --apply
```

`--apply` writes both improved selectors and high-confidence assertion candidates to the YAML file.

## Apply Selectors Only

```bash
ui-test improve e2e/login.yaml --apply-selectors
```

This applies only selector improvements without inserting assertion candidates.

## Apply Assertions Only

```bash
ui-test improve e2e/login.yaml --apply-assertions
```

This inserts high-confidence assertion candidates into YAML after runtime validation, without updating selectors.
In the deterministic source (`--assertion-source deterministic`), auto-apply uses a conservative mapping:
- `fill/select -> assertValue`
- `check/uncheck -> assertChecked`
- click/press assertions are intentionally not auto-generated
- existing adjacent self-visibility assertions are preserved (no automatic cleanup)
- at most one assertion is auto-applied per source step

Validation uses post-step network-idle timing similar to `play` defaults (enabled, `2000ms` timeout).
Runtime validation failures are skipped and reported as warnings.
Runtime-failing assertions are never force-applied.
Improve no longer injects coverage fallback assertions.

## Assertion Apply Policy

```bash
ui-test improve e2e/login.yaml --apply-assertions --assertion-apply-policy reliable
ui-test improve e2e/login.yaml --apply-assertions --assertion-apply-policy aggressive
```

Policy matrix:
- `reliable` (default): snapshot-derived `assertVisible` is report-only (`skipped_policy`).
- `aggressive`: snapshot-derived `assertVisible` is auto-eligible after runtime validation.
- Snapshot-derived `assertText` remains auto-eligible in both policies.

## Assertion Source (Opt-In Snapshot Mode)

```bash
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-native
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
```

Two snapshot-based assertion sources are available:

### snapshot-native (recommended)

Uses Playwright's native `locator.ariaSnapshot()` API to capture page state before and after each step during the existing improve replay. No external tool required.

### snapshot-cli

Replays steps in a separate Playwright-CLI process and captures snapshots after each step. Requires `playwright-cli` or `npx -y @playwright/cli@latest --help`.

Both modes generate assertion candidates from snapshot deltas (`assertVisible`/`assertText`) and then runtime-validate before insertion.
Reliability policy in apply mode:
- snapshot-derived `assertVisible` candidates are report-only (`skipped_policy`) and are never auto-inserted
- snapshot-derived `assertText` candidates may still be auto-inserted after runtime validation

Fallback behavior:
- If the snapshot source is unavailable or fails, improve falls back to deterministic candidates.
- Diagnostics include fallback reason codes in the JSON report.

## Assertions Mode

```bash
ui-test improve e2e/login.yaml --assertions candidates
ui-test improve e2e/login.yaml --assertions none
```

Current scope:
- Assertions are reported as candidates.
- Assertions are auto-inserted when `--apply` or `--apply-assertions` is used.
- Default assertion source is `snapshot-native`, which captures page state changes during replay. Use `--assertion-source deterministic` for conservative form-state-only assertions, or `--assertion-source snapshot-cli` for external Playwright-CLI snapshots.
- Deterministic source focuses on stable form-state assertions and excludes click/press-derived visibility checks.
- Snapshot sources (`snapshot-native`, `snapshot-cli`) can additionally propose `assertVisible`/`assertText` from snapshot deltas.
- Snapshot `assertVisible` candidates are report-only in apply mode; snapshot `assertText` can be applied after runtime validation.
- Playwright codegen can generate assertions interactively, but `improve` assertion apply is deterministic.

## Aria-Based Selector Improvement

When a browser is available, improve uses Playwright's `ariaSnapshot()` API to inspect each element's accessibility role and name. This generates semantic locator candidates that replace brittle CSS, XPath, and Playwright selectors with resilient, human-readable alternatives:

- `getByRole(role, { name })` — for any element with an accessible role and name (buttons, links, headings, form controls, dialogs, tabs, etc.)
- `getByLabel(name)` — for form controls (textbox, combobox, listbox, searchbox, spinbutton)
- `getByPlaceholder(text)` — for form controls with a placeholder attribute
- `getByText(text)` — for text-bearing roles (headings, links, alerts, status elements)

These candidates are scored alongside syntactic candidates and adopted when they score significantly higher than the current selector (delta >= 0.15).

This happens automatically during improve — no extra flags needed.

## Report Contents

The report includes:
- step-level old/recommended targets
- confidence deltas
- assertion candidates
- assertion apply status (`applied`, `skipped_low_confidence`, `skipped_runtime_failure`, `skipped_policy`, `skipped_existing`, `not_requested`)
- legacy `assertion_coverage_*` diagnostics are no longer emitted
- diagnostics and degradations

CLI output also includes:
- assertion apply status breakdown by `applyStatus`
- assertion candidate source breakdown
- up to three concise skip details (with remaining count)
- warning when the invoked `ui-test` binary is outside the current workspace path

Doctor command for environment verification:

```bash
ui-test doctor
```

`doctor` reports CLI version, node version, binary path, invocation classification, local package version, and actionable mismatch warnings.

Default report path:
- `<test-file>.improve-report.json`

Custom path:

```bash
ui-test improve e2e/login.yaml --report ./reports/login.improve.json
```

## Runtime Safety Notes

- Apply mode (`--apply`, `--apply-selectors`, `--apply-assertions`) requires runtime validation.
- Runtime analysis may replay actions; use a safe test environment.
- If browser runtime is unavailable, review mode can still run with static scoring fallback.
