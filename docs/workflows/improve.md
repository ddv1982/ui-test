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
Runtime validation failures are skipped and reported as warnings.

## LLM-Optional Mode (Ollama)

```bash
npx ui-test improve e2e/login.yaml --llm
```

Disable explicitly per run:

```bash
npx ui-test improve e2e/login.yaml --no-llm
```

## Provider Selection

```bash
npx ui-test improve e2e/login.yaml --provider auto
npx ui-test improve e2e/login.yaml --provider playwright
npx ui-test improve e2e/login.yaml --provider playwright-cli
```

Behavior:
- `auto`: prefer `playwright-cli`, degrade to direct Playwright when unavailable.
- `playwright-cli`: best-effort CLI adapter; degrades safely.
- `playwright`: direct Playwright runtime only.

## Assertions Mode

```bash
npx ui-test improve e2e/login.yaml --assertions candidates
npx ui-test improve e2e/login.yaml --assertions none
```

Current scope:
- Assertions are reported as candidates.
- Assertions are auto-inserted only when `--apply-assertions` is enabled.
- Playwright codegen can generate assertions interactively, but `improve` assertion apply is deterministic and does not require LLM.

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
