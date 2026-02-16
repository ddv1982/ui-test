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
- **`fill`** — type `text` into the element matched by `target`
- **`click`** — click the element matched by `target`
- **`assertVisible`** — verify the `target` element is visible
- **`assertText`** — verify the `target` element contains `text`

The `target` object identifies the element:

- **`value`** — the selector string or locator expression
- **`kind`** — selector type (`css`, `xpath`, `locatorExpression`, `playwrightSelector`, etc.)
- **`source`** — how the selector was created (`manual`, `codegen-jsonl`, `improve`, etc.)

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

## Improve Selector Quality

```bash
ui-test improve e2e/login.yaml
ui-test improve e2e/login.yaml --apply
```

Without `--apply`, improve writes a report only. With `--apply`, it updates selectors and inserts assertion candidates directly into the YAML file.

For snapshot-cli assertions:

```bash
ui-test improve e2e/login.yaml --apply --assertion-source snapshot-cli
```

## Next Steps

- Record workflow: [Record Workflow](workflows/record.md)
- Improve workflow: [Improve Workflow](workflows/improve.md)
- Command help: `ui-test --help`
