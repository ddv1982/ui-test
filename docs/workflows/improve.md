# Improve Workflow

`improve` is a post-processing step for recorded YAML tests.

## Usage

### Default (Interactive)

```bash
ui-test improve e2e/login.yaml
```

This prompts you to confirm before applying improvements:

```
? Apply improvements to login.yaml? (Y/n)
```

Accept (default) to apply improved selectors and assertion candidates to the YAML file, or decline for a report-only run.

### Apply Without Prompting (CI)

```bash
ui-test improve e2e/login.yaml --apply
```

`--apply` writes both improved selectors and high-confidence assertion candidates to the YAML file without prompting.

### Report Only (CI)

```bash
ui-test improve e2e/login.yaml --no-apply
```

`--no-apply` writes a JSON report and does not modify YAML. Useful in CI pipelines where interactive prompts are not available.

In report-only runs (`--no-apply`), assertion candidates keep `applyStatus: not_requested`, including candidates that would be policy-capped or volatility-filtered in apply mode.

Before/after example — a CSS selector upgraded to a semantic locator:

```yaml
# Before
target:
  value: "#submit-btn"
  kind: css
  source: codegen-jsonl
# After
target:
  value: "getByRole('button', { name: 'Submit' })"
  kind: locatorExpression
  source: manual
```

### Selectors Only (No Assertions)

```bash
ui-test improve e2e/login.yaml --assertions none --apply
```

### Assertion Sources

| Source | Description |
|--------|-------------|
| `snapshot-native` (default) | Uses Playwright's `locator.ariaSnapshot()` to capture page state changes during replay. No external tool needed. |
| `deterministic` | Conservative form-state-only assertions (`assertValue`/`assertChecked`). No browser needed beyond replay. |

```bash
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-native
ui-test improve e2e/login.yaml --apply --assertion-source deterministic
```

### Assertions Mode

- `candidates` (default): generate and optionally apply assertion candidates.
- `none`: skip assertion generation entirely.

```bash
ui-test improve e2e/login.yaml --assertions candidates
ui-test improve e2e/login.yaml --assertions none
```

### Assertion Rules

These rules govern how assertions are inserted:

1. In apply mode, at most one assertion per source step; additional candidates are reported as `skipped_policy`.
2. In apply mode, snapshot `assertVisible` is report-only and never auto-inserted (`skipped_policy`).
3. Snapshot `assertText` can be auto-inserted after runtime validation.
4. Runtime-failing candidates are never force-applied (`skipped_runtime_failure`).
5. Existing adjacent assertions are preserved (no automatic cleanup).
6. Applied assertions are marked `optional: true` so they don't hard-fail tests when page content changes.
7. In apply mode, runtime-failing interaction steps are classified: transient dismissal/control interactions are removed aggressively, while likely content/business-intent interactions are safeguarded and kept as `optional: true`.

### Auto-Improve After Recording

After recording, `ui-test record` automatically runs `improve` to upgrade selectors, add assertion candidates, and classify runtime-failing interactions (aggressively remove transient dismissal/control `click`/`press` failures, optionalize non-transient and safeguarded content/business interactions). Use `--no-improve` to skip this:

```bash
ui-test record --name login --url https://example.com --no-improve
```

---

## Reference

### Deterministic Source Mapping

With `--assertion-source deterministic`, auto-apply uses a conservative mapping:

- `fill` / `select` → `assertValue`
- `check` / `uncheck` → `assertChecked`
- `click` / `press` → no assertions generated

### Assertion Source Fallback

If the snapshot source is unavailable or fails, improve falls back to deterministic candidates. Diagnostics include fallback reason codes in the JSON report.

### Aria-Based Selector Improvement

When a browser is available, improve uses Playwright's `ariaSnapshot()` API to inspect each element's accessibility role and name. This generates semantic locator candidates:

- `getByRole(role, { name })` — for any element with an accessible role and name
- `getByLabel(name)` — for form controls (textbox, combobox, listbox, searchbox, spinbutton)
- `getByPlaceholder(text)` — for form controls with a placeholder attribute
- `getByText(text)` — for text-bearing roles (headings, links, alerts, status elements)

These candidates are scored alongside syntactic candidates and adopted when they score significantly higher than the current selector (delta >= 0.15). This happens automatically — no extra flags needed.

### Report Contents

The report includes step-level old/recommended targets, confidence scores, assertion candidates, and diagnostics.

The summary includes:

- `selectorRepairCandidates`
- `selectorRepairsApplied`
- `runtimeFailingStepsOptionalized`
- `runtimeFailingStepsRemoved`
- `assertionCandidatesFilteredVolatile`

Each assertion candidate has an `applyStatus`:

| Status | Meaning |
|--------|---------|
| `applied` | Written to YAML |
| `skipped_low_confidence` | Below confidence threshold |
| `skipped_runtime_failure` | Failed runtime validation |
| `skipped_policy` | Apply-mode policy skip (for example `assertVisible`, or extra assertions beyond one-per-step) |
| `skipped_existing` | Step already has an assertion |
| `not_requested` | Report-only run (`--no-apply`): candidate was generated but not considered for apply/validation |

Default report path: `<test-file>.improve-report.json`

Custom path:

```bash
ui-test improve e2e/login.yaml --report ./reports/login.improve.json
```

### Runtime Safety Notes

- Runtime analysis may replay actions; use a safe test environment.
- `improve` requires Chromium availability in CLI runs.
- If Chromium is missing, provision it with `ui-test setup` or `npx playwright install chromium`.
- Validation timing mirrors `play` post-step waiting (network idle with Playwright default timeout behavior).
