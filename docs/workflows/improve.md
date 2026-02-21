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

In report-only runs (`--no-apply`), assertion candidates keep `applyStatus: not_requested`, including candidates that would be policy-capped or dynamic-filtered in apply mode.

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

### Assertion Policy

`--assertion-policy` controls assertion strictness in apply mode:

| Policy | Behavior |
|--------|----------|
| `reliable` | Most conservative: stable-structural snapshot `assertVisible` only, tighter dynamic filters, 1 applied assertion per step. |
| `balanced` (default) | Runtime-validated snapshot `assertVisible` allowed, moderate dynamic filters, up to 2 applied assertions per step. |
| `aggressive` | Highest coverage: runtime-validated snapshot `assertVisible`, light dynamic filtering, up to 3 applied assertions per step. |

Exact policy matrix:

| Policy | Applied per-step cap | Snapshot volume cap (`navigate`/other) | Snapshot `assertVisible` | Snapshot `assertText` min score | Volatility hard-filter flags |
|--------|-----------------------|-----------------------------------------|---------------------------|----------------------------------|-------------------------------|
| `reliable` | `1` | `1/2` | `stable_structural_only` | `0.82` | `contains_numeric_fragment`, `contains_date_or_time_fragment`, `contains_weather_or_news_fragment`, `long_text`, `contains_headline_like_text`, `contains_pipe_separator` |
| `balanced` | `2` | `2/3` | `runtime_validated` | `0.78` | `contains_headline_like_text`, `contains_pipe_separator` |
| `aggressive` | `3` | `3/4` | `runtime_validated` | `0.72` | `contains_headline_like_text` |

```bash
ui-test improve e2e/login.yaml --apply --assertion-policy balanced
ui-test improve e2e/login.yaml --apply --assertion-policy reliable
ui-test improve e2e/login.yaml --apply --assertion-policy aggressive
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

1. Per-step apply cap is policy-driven: `reliable=1`, `balanced=2`, `aggressive=3`; extra candidates are marked `skipped_policy`.
2. Snapshot `assertVisible` handling is policy-driven: `reliable` only allows stable-structural candidates, while `balanced`/`aggressive` allow runtime-validated visibility candidates.
3. Snapshot `assertText` min apply score is policy-driven (`reliable=0.82`, `balanced=0.78`, `aggressive=0.72`).
4. Volatility hard-filtering is policy-driven and only applied in apply mode.
5. Runtime-failing candidates are never force-applied (`skipped_runtime_failure`).
6. Deterministic coverage fallbacks (`click`/`press`/`hover` -> `assertVisible`) remain eligible in apply mode as backup candidates when stronger assertions fail runtime validation.
7. In `snapshot-native` mode, improve performs gap-only runtime locator inventory harvesting from post-step aria snapshots and adds inventory fallback candidates only for uncovered interaction steps.
8. Existing adjacent assertions are preserved (no automatic cleanup).
9. Applied assertions are inserted as required steps (no `optional` field).
10. In apply mode, runtime-failing interaction steps are classified: transient dismissal/control interactions are removed aggressively, while likely content/business-intent interactions are retained as required steps.

### Auto-Improve After Recording

After recording, `ui-test record` automatically runs `improve` to upgrade selectors, add assertion candidates, and classify runtime-failing interactions (aggressively remove transient dismissal/control `click`/`press` failures, retain non-transient and safeguarded content/business interactions as required steps). Use `--no-improve` to skip this:

```bash
ui-test record --name login --url https://example.com --no-improve
```

---

## Reference

### Deterministic Source Mapping

With `--assertion-source deterministic`, auto-apply uses a conservative mapping:

- `fill` / `select` → `assertValue`
- `check` / `uncheck` → `assertChecked`
- `click` / `press` / `hover` → low-priority coverage fallback `assertVisible` candidates (`coverageFallback: true`, confidence `0.76`)

Coverage fallback candidates are always generated, but they remain low priority:

- Non-fallback candidates are prioritized first by scoring/action policy.
- Fallbacks still run through normal policy/runtime validation and can apply when higher-priority assertions fail at runtime.
- Once a non-fallback assertion is applied for a step, remaining fallback candidates for that step are skipped as backup-only.
- When both are fallback candidates, deterministic fallback is preferred over inventory fallback.

### Snapshot-Native Inventory Harvesting

When `--assertion-source snapshot-native` is active, improve reuses per-step post-action `ariaSnapshot()` state to harvest additional locator/assertion evidence for under-covered interaction steps.

- Runs only for assertion generation mode (`--assertions candidates`).
- Gap-only by default: steps already covered by non-fallback assertions do not get extra inventory candidates.
- Uses no extra replay pass; it reuses snapshots already captured during runtime analysis.
- Inventory candidates are marked as fallback (`coverageFallback: true`) and still pass through normal policy filtering and runtime validation.

### Assertion Source Fallback

If the snapshot source is unavailable or fails, improve falls back to deterministic candidates. Diagnostics include fallback reason codes in the JSON report.

### Aria-Based Selector Improvement

When a browser is available, improve uses Playwright's `ariaSnapshot()` API to inspect each element's accessibility role and name. This generates semantic locator candidates:

- `getByRole(role, { name })` — for any element with an accessible role and name
- `getByLabel(name)` — for form controls (textbox, combobox, listbox, searchbox, spinbutton)
- `getByPlaceholder(text)` — for form controls with a placeholder attribute
- `getByText(text)` — for text-bearing roles (headings, links, alerts, status elements)

These candidates are scored alongside syntactic candidates and adopted when they score significantly higher than the current selector (delta >= 0.15). This happens automatically — no extra flags needed.

### Playwright Runtime Selector Regeneration

For dynamic-flagged/brittle targets (for example long exact headline link names), improve also attempts a runtime selector regeneration pass:

- Requires a unique runtime match (`matchCount === 1`) before generating a repair candidate.
- Runs as a dedicated runtime-repair stage after baseline and heuristic locator-repair candidate generation.
- Uses public Playwright locator conversion first (`page.locator(...).toString()`), with a guarded private `_resolveSelector()` fallback when needed.
- Falls back safely to existing repair heuristics when internals are unavailable or conversion fails.
- Set `UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_REGEN=1` to disable runtime regeneration/conversion and use heuristic repairs only.
- Set `UI_TEST_DISABLE_PLAYWRIGHT_RUNTIME_PRIVATE_FALLBACK=1` to disable only the private `_resolveSelector()` fallback while keeping public runtime conversion enabled.

Runtime regeneration diagnostics:

- `selector_repair_generated_via_playwright_runtime`
- `selector_repair_playwright_runtime_unavailable`
- `selector_repair_playwright_runtime_non_unique`
- `selector_repair_playwright_runtime_conversion_failed`
- `selector_repair_playwright_runtime_disabled`
- `selector_repair_playwright_runtime_private_fallback_disabled`
- `selector_repair_playwright_runtime_private_fallback_used`

### Report Contents

The report includes step-level old/recommended targets, confidence scores, assertion candidates, and diagnostics.

The summary includes:

- `selectorRepairCandidates`
- `selectorRepairsApplied`
- `selectorRepairsGeneratedByPlaywrightRuntime`
- `selectorRepairsAppliedFromPlaywrightRuntime`
- `selectorRepairsGeneratedByPrivateFallback`
- `selectorRepairsAppliedFromPrivateFallback`
- `runtimeFailingStepsRetained`
- `runtimeFailingStepsOptionalized`
- `runtimeFailingStepsRemoved`
- `assertionCandidatesFilteredDynamic`
- `assertionCoverageStepsTotal`
- `assertionCoverageStepsWithCandidates`
- `assertionCoverageStepsWithApplied`
- `assertionCoverageCandidateRate`
- `assertionCoverageAppliedRate`
- `assertionFallbackApplied`
- `assertionFallbackAppliedOnlySteps`
- `assertionFallbackAppliedWithNonFallbackSteps`
- `assertionInventoryStepsEvaluated`
- `assertionInventoryCandidatesAdded`
- `assertionInventoryGapStepsFilled`

`runtimeFailingStepsOptionalized` is a deprecated alias for one release cycle and mirrors `runtimeFailingStepsRetained`.

Each assertion candidate has an `applyStatus`:

| Status | Meaning |
|--------|---------|
| `applied` | Written to YAML |
| `skipped_low_confidence` | Below confidence threshold |
| `skipped_runtime_failure` | Failed runtime validation |
| `skipped_policy` | Apply-mode policy skip (for example visibility rules, dynamic hard-filter, or profile cap reached) |
| `skipped_existing` | Step already has an assertion |
| `not_requested` | Report-only run (`--no-apply`): candidate was generated but not considered for apply/validation |

Runtime-failing step diagnostics use `runtime_failing_step_retained` (canonical) and emit `runtime_failing_step_marked_optional` as a deprecated alias for one release cycle.

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
