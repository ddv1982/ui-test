# Record Workflow

Use `record` to capture interactions and produce V2 YAML steps.

## Basic Recording

```bash
ui-test record
```

You will be prompted for:
- test name
- starting URL
- optional description

## Key Flags

```bash
ui-test record --selector-policy reliable
ui-test record --browser firefox
ui-test record --device "iPhone 13"
ui-test record --test-id-attribute data-qa
ui-test record --load-storage .auth/in.json --save-storage .auth/out.json
```

## Selector Policy

- `reliable` (default): prefers normalized locator expressions.
- `raw`: preserves raw selectors when available.

## Reliability Behavior

`record` uses:
1. Primary: Playwright JSONL codegen.
2. Fallback: `playwright-test` codegen parsed with constrained AST.

If fallback is used, CLI output marks degraded fidelity.

## Output Quality Summary

After recording, CLI prints:
- recording mode (`jsonl` or `fallback`)
- selector quality stats (`stable`, `fallback`, `frame-aware`)

## Resulting YAML Shape

Selector steps use:

```yaml
target:
  value: "..."
  kind: locatorExpression | playwrightSelector | css | xpath | internal | unknown
  source: manual | codegen-jsonl | codegen-fallback
```

## Common Tips

- Record with realistic test data.
- Add assertions after recording.
- Keep selectors user-facing when possible (`getByRole`, `getByLabel`, `getByTestId`).
