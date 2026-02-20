# Getting Started

This guide is for first-time `ui-test` users.

## Prerequisites

- Node.js 18+
- npm

## Pick Your Entry Path

### Repository checkout

```bash
npm run setup
```

### Global install

```bash
npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"
ui-test setup --browsers chromium
```

### One-off run (no install)

```bash
npx -y github:ddv1982/easy-e2e-testing setup --browsers chromium
```

All command examples below use global `ui-test`.

## Setup

`ui-test setup` launches an interactive browser picker. For non-interactive use, pass `--browsers`:

```bash
ui-test setup
ui-test setup --browsers chromium
ui-test setup --browsers chromium --run-play
```

## Test File Format

Test files are YAML documents in the `e2e/` directory. Here is `e2e/example.yaml`:

```yaml
name: Example Test
description: A visible sample flow to demonstrate headed execution
steps:
  - action: navigate
    url: /
    description: Open the example app
  - action: assertVisible
    description: App root is visible
    target:
      value: "#app"
      kind: css
      source: manual
  - action: fill
    description: Type a name into the input
    target:
      value: "[data-testid='name-input']"
      kind: css
      source: manual
    text: "Codex"
  - action: click
    description: Click the greet button
    target:
      value: "[data-testid='greet-button']"
      kind: css
      source: manual
  - action: assertText
    description: Greeting message is updated
    target:
      value: "[data-testid='message']"
      kind: css
      source: manual
    text: "Hello, Codex!"
```

Each step has an `action` type:

- **`navigate`** — go to a URL (relative URLs use the configured `baseUrl`)
- **`click`** — click the element matched by `target`
- **`fill`** — type `text` into the element matched by `target`
- **`press`** — press a keyboard `key` on the `target` element
- **`check`** / **`uncheck`** — toggle a checkbox
- **`hover`** — hover over the `target` element
- **`select`** — pick an option by `value` from a dropdown
- **`assertVisible`** — verify the `target` element is visible
- **`assertText`** — verify the `target` element contains `text`
- **`assertValue`** — verify the `target` input has a specific `value`
- **`assertChecked`** — verify a checkbox is checked (or unchecked)

The `target` object identifies the element:

- **`value`** — the selector string or locator expression
- **`kind`** — selector type (`css`, `xpath`, `locatorExpression`, `playwrightSelector`, etc.)
- **`source`** — how the selector was created (`manual`, `codegen-jsonl`, `codegen-fallback`)

`optional: true` is no longer supported for steps. Remove this field from existing YAML tests. Steps can include `timeout: <ms>` to override the global step timeout.

## Run Tests

```bash
ui-test play
```

If your app is already running and you do not want auto-start:

```bash
ui-test play --no-start
```

Auto-start launches the built-in example app for `e2e/example.yaml` only.

## Record and Replay

```bash
ui-test record
ui-test play
```

This opens a browser. Interact with your app, then close the browser to save the recording as a YAML file in the `e2e/` directory.

After recording, `ui-test` automatically improves selectors, adds assertion candidates, and classifies runtime-failing interactions (aggressively removes transient dismissal/control `click`/`press` failures, retains non-transient and safeguarded content/business interactions as required steps). Use `--no-improve` to skip this.

## Improve Tests

`improve` upgrades selectors, generates assertion candidates, and classifies runtime-failing interactions (aggressively removes transient dismissal/control `click`/`press` failures, retains non-transient and safeguarded content/business interactions as required steps).

```bash
ui-test improve e2e/login.yaml
ui-test improve e2e/login.yaml --apply
ui-test improve e2e/login.yaml --no-apply
```

By default, `improve` prompts you to confirm before applying changes. Use `--apply` to skip the prompt (CI-friendly), or `--no-apply` for a report-only run without prompting.

Apply-mode runs can mark candidates as `skipped_policy` when policy caps/filters are enforced. Report-only runs (`--no-apply`) keep candidate status as `not_requested`.

Control assertion generation with `--assertions`:

```bash
ui-test improve e2e/login.yaml --assertions candidates   # default
ui-test improve e2e/login.yaml --assertions none          # skip assertions
```

Control apply strictness with `--assertion-policy`:

```bash
ui-test improve e2e/login.yaml --assertion-policy balanced    # default
ui-test improve e2e/login.yaml --assertion-policy reliable
ui-test improve e2e/login.yaml --assertion-policy aggressive
```

## Next Steps

- Record workflow: [Record Workflow](workflows/record.md)
- Improve workflow: [Improve Workflow](workflows/improve.md)
- Configuration: [Configuration](configuration.md)
- Command help: `ui-test --help`
