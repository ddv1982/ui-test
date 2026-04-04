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
| `--browser <browser>` | `chromium`, `firefox`, or `webkit` | `chromium` |
| `--device <name>` | Playwright device name | none |
| `--test-id-attribute <attr>` | Custom test-id attribute | none |
| `--load-storage <path>` | Preload browser storage state | none |
| `--save-storage <path>` | Save browser storage state | none |
| `--improve-mode <mode>` | Auto-improve mode: `report` or `apply` | `report` |
| `--no-improve` | Skip automatic improvement after recording | enabled |

Skip all prompts by providing name and URL:

```bash
ui-test record --name "Login flow" --url http://localhost:3000/login
```

## After Recording

After the browser is closed, `ui-test` automatically runs `improve` on the new test file.

Default mode is review-first (`--improve-mode report`), which writes only the improve report and leaves the recorded YAML unchanged.
Default auto-improve uses deterministic assertion candidates with the `reliable` policy so post-record suggestions remain stable and reviewable.
Use `--improve-mode apply` to write an improved copy (`<recorded>.improved.yaml`) while preserving the original recording.

Auto-improve can:

- Upgrades selectors to more reliable alternatives
- Generates assertion candidates (e.g. `assertVisible`, `assertText`)
- Classifies runtime-failing interactions (aggressively removes transient dismissal/control `click`/`press` failures, retains non-transient and safeguarded content/business interactions as required steps)

The CLI prints a summary of recommendations/changes. If auto-improve fails, the recording is still saved and you can run `ui-test improve <file> --apply` manually (writes `<file>.improved.yaml` by default).

Policy-capped or policy-filtered assertion candidates are reported as `skipped_policy`; report-only improve runs keep candidates as `not_requested`.

Use `--no-improve` to skip auto-improvement entirely.

## Output Quality Summary

After recording, the CLI prints a summary of selector quality.

## Resulting YAML Shape

Selector steps use:

```yaml
target:
  value: "..."
  kind: locatorExpression | playwrightSelector | css | xpath | internal | unknown
  source: manual | codegen | devtools-import
```

The `source` field records how the selector was produced: `codegen` for Playwright codegen recordings, `devtools-import` for Chrome DevTools Recorder JSON imports, or `manual` if you wrote it by hand. Legacy YAML may still contain `codegen-jsonl` / `codegen-fallback`.

## Common Tips

- Record with realistic test data.
- Review auto-improve results and adjust assertions as needed.
- Keep selectors user-facing when possible (`getByRole`, `getByLabel`, `getByTestId`).
