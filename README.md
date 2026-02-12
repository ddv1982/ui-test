# easy-e2e

No-code E2E testing framework - record and replay browser tests with YAML.

## Installation

```bash
# from this repo (local)
npm install --save-dev .

# from GitHub
npm install --save-dev github:ddv1982/easy-e2e-testing#main
```

`easy-e2e` is not currently published to npm with installable versions, so
`npm install --save-dev easy-e2e` will fail with `ENOVERSIONS`.

## Quick Start

### 1. Install and initialize

```bash
npm install --save-dev .
npx easy-e2e init
```

Accept the defaults for the built-in Vue example app:

- `baseUrl`: `http://127.0.0.1:5173`
- `startCommand`: `npx easy-e2e example-app --host 127.0.0.1 --port 5173`

### 2. Run tests (one command)

```bash
npx easy-e2e play
```

`play` auto-starts the app when `startCommand` is present in `easy-e2e.config.yaml`.

### 3. Optional manual mode

If you already started the app yourself:

```bash
npx easy-e2e example-app --host 127.0.0.1 --port 5173
npx easy-e2e play --no-start
```

### 4. Record a test

```bash
npx easy-e2e record
```

### 5. List tests

```bash
npx easy-e2e list
```

## Test Format

Tests are written in YAML with a simple, readable format:

```yaml
name: Login Test
description: Test user login flow
baseUrl: https://example.com

steps:
  - action: navigate
    url: /login

  - action: fill
    selector: '#username'
    text: testuser

  - action: fill
    selector: '#password'
    text: password123

  - action: click
    selector: 'button[type=submit]'

  - action: assertVisible
    selector: '.dashboard'
    description: User is logged in
```

## Available Actions

- `navigate` - Navigate to URL
- `click` - Click element
- `fill` - Fill input field
- `press` - Press keyboard key
- `check` - Check checkbox
- `uncheck` - Uncheck checkbox
- `hover` - Hover over element
- `select` - Select dropdown option
- `assertVisible` - Assert element is visible
- `assertText` - Assert element contains text
- `assertValue` - Assert input has value
- `assertChecked` - Assert checkbox is checked

## Selector Syntax

Each `selector` field supports:

- Plain CSS selectors (for example `#submit`, `.card button`)
- XPath selectors (for example `//button[@type='submit']`)
- Playwright text selectors (`text=Save`)
- Safe Playwright locator expressions with chaining, such as:
  - `getByRole('button', { name: 'Save' })`
  - `getByRole('button', { name: /save/i }).filter({ hasText: 'Save' }).nth(0)`
  - `frameLocator('#checkout-frame').getByText('Confirm').first()`

`easy-e2e` validates locator expressions with a safe allowlist and rejects arbitrary JavaScript execution.

## Configuration

Create `easy-e2e.config.yaml`:

```yaml
testDir: e2e
baseUrl: http://127.0.0.1:5173
startCommand: npx easy-e2e example-app --host 127.0.0.1 --port 5173
headed: false
timeout: 10000
delay: 2000 # optional; milliseconds between steps
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Coverage

Coverage thresholds are enforced in [vitest.config.ts](vitest.config.ts):

- **Lines:** 60%
- **Functions:** 100%
- **Branches:** 50%
- **Statements:** 60%

Run `npm run test:coverage` for current local metrics.  
See [docs/test-coverage-report.md](docs/test-coverage-report.md) for the latest recorded snapshot.

## License

MIT
