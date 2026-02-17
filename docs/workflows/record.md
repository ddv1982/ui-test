# Record Workflow

Use `record` to capture browser interactions and produce YAML test steps.

## Basic Recording

```bash
ui-test record
```

You will be prompted for:
- test name
- starting URL
- optional description
- output directory

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --name <name>` | Test name (skips prompt) | prompted |
| `-u, --url <url>` | Starting URL (skips prompt) | prompted |
| `-d, --description <desc>` | Test description (skips prompt) | prompted |
| `-o, --output-dir <dir>` | Output directory | `e2e` |
| `--selector-policy <policy>` | `reliable` or `raw` | `reliable` |
| `--browser <browser>` | `chromium`, `firefox`, or `webkit` | `chromium` |
| `--device <name>` | Playwright device name | none |
| `--test-id-attribute <attr>` | Custom test-id attribute | none |
| `--load-storage <path>` | Preload browser storage state | none |
| `--save-storage <path>` | Save browser storage state | none |
| `--no-improve` | Skip automatic improvement after recording | enabled |

Skip all prompts by providing name and URL:

```bash
ui-test record --name "Login flow" --url http://localhost:3000/login
```

## After Recording

After the browser is closed, `ui-test` automatically runs `improve` on the new test file. This:

- Upgrades selectors to more reliable alternatives
- Generates assertion candidates (e.g. `assertVisible`, `assertText`)
- Removes transient steps that fail at runtime

The CLI prints a summary of changes. If auto-improve fails, the recording is still saved and you can run `ui-test improve <file> --apply` manually.

Use `--no-improve` to skip auto-improvement entirely.

## Selector Policy

- `reliable` (default): prefers normalized locator expressions.
- `raw`: preserves raw selectors when available.

## Output Quality Summary

After recording, the CLI prints a summary of selector quality.

## Resulting YAML Shape

Selector steps use:

```yaml
target:
  value: "..."
  kind: locatorExpression | playwrightSelector | css | xpath | internal | unknown
  source: manual | codegen-jsonl | codegen-fallback
```

The `source` field records how the selector was produced: `codegen-jsonl` from the primary recorder, `codegen-fallback` from the backup recorder, or `manual` if you wrote it by hand.

## Common Tips

- Record with realistic test data.
- Review auto-improve results and adjust assertions as needed.
- Keep selectors user-facing when possible (`getByRole`, `getByLabel`, `getByTestId`).
