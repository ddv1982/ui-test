# Improve Workflow

`improve` is a post-processing step for recorded YAML tests.

## Default (Review First)

```bash
npx ui-test improve e2e/login.yaml
```

This writes a JSON report and does not modify YAML.

## Apply Approved Changes

```bash
npx ui-test improve e2e/login.yaml --apply
```

Apply mode writes improved targets back to the same file.

## Apply Assertion Candidates

```bash
npx ui-test improve e2e/login.yaml --apply-assertions
```

This inserts high-confidence assertion candidates into YAML after runtime validation.
Auto-apply uses a conservative deterministic mapping:
- `fill/select -> assertValue`
- `check/uncheck -> assertChecked`
- click/press assertions are intentionally not auto-generated
- stale adjacent self-visibility assertions are removed in apply modes (`click/press -> same-target assertVisible`)

Validation uses post-step network-idle timing similar to `play` defaults (enabled, `2000ms` timeout).
Runtime validation failures are skipped and reported as warnings.

## Assertion Source (Opt-In Snapshot Mode)

```bash
npx ui-test improve e2e/login.yaml --apply-assertions --assertion-source snapshot-cli
```

This mode replays steps headlessly and captures Playwright-CLI snapshots after each step.
Assertion candidates are generated from snapshot deltas (`assertVisible`/`assertText`) and then runtime-validated before insertion.

Fallback behavior:
- If snapshot-cli is unavailable or replay fails, improve falls back to deterministic candidates.
- Diagnostics include fallback reason codes in the JSON report.

## Assertions Mode

```bash
npx ui-test improve e2e/login.yaml --assertions candidates
npx ui-test improve e2e/login.yaml --assertions none
```

Current scope:
- Assertions are reported as candidates.
- Assertions are auto-inserted only when `--apply-assertions` is enabled.
- Default assertion source is `deterministic`; opt in to replay/snapshot generation with `--assertion-source snapshot-cli`.
- Auto-insert focuses on stable form-state assertions and excludes click/press-derived visibility checks.
- Playwright codegen can generate assertions interactively, but `improve` assertion apply is deterministic.

## Report Contents

The report includes:
- step-level old/recommended targets
- confidence deltas
- assertion candidates
- assertion apply status (`applied`, `skipped_low_confidence`, `skipped_runtime_failure`, `skipped_existing`, `not_requested`)
- diagnostics and degradations

Default report path:
- `<test-file>.improve-report.json`

Custom path:

```bash
npx ui-test improve e2e/login.yaml --report ./reports/login.improve.json
```

## Runtime Safety Notes

- Apply mode (`--apply` and `--apply-assertions`) requires runtime validation.
- Runtime analysis may replay actions; use a safe test environment.
- If browser runtime is unavailable, review mode can still run with static scoring fallback.
