# easy-e2e

No-code E2E testing framework - record and replay browser tests with YAML.

## Installation

```bash
npm install --save-dev easy-e2e
```

## Quick Start

### 1. Initialize

```bash
npx easy-e2e init
```

### 2. Record a test

```bash
npx easy-e2e record
```

### 3. Run tests

```bash
npx easy-e2e play
```

### 4. List tests

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

## Configuration

Create `easy-e2e.config.yaml`:

```yaml
testDir: tests
baseUrl: http://localhost:3000
headed: false
timeout: 10000
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

This project maintains comprehensive test coverage across all core modules:

- **104 total tests** (95 unit + 9 integration)
- **100% function coverage** - All public APIs tested
- **74.86% line coverage** - Core logic thoroughly validated
- **Fast feedback** - Unit tests run in ~30ms
- **Real browser validation** - Integration tests with Playwright

See [docs/test-coverage-report.md](docs/test-coverage-report.md) for detailed coverage metrics.

## License

MIT
