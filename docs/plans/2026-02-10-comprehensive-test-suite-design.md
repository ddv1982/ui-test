# Test Suite Design - Comprehensive Coverage

> Historical planning artifact (2026-02-10). This file is not the source of truth for current repo behavior, schema, scripts, or thresholds.

**Date:** 2026-02-10
**Status:** Approved
**Coverage Goal:** 80%+ for core modules

## Overview

Implement a comprehensive test suite for the easy-e2e testing framework using Vitest. The suite uses a hybrid approach: fast unit tests with mocked dependencies for core logic, and integration tests with real Playwright browsers for end-to-end validation.

## Architecture

### Testing Layers

1. **Unit Tests** - Fast, isolated tests for pure functions
   - Colocated with source files (e.g., `transformer.test.ts` next to `transformer.ts`)
   - Mock Playwright and file system operations
   - Target: < 5s execution time

2. **Integration Tests** - Real browser validation
   - Separate `.integration.test.ts` files
   - Use real Playwright with local HTML fixtures
   - Target: < 30s execution time

### File Structure

```
src/
├── core/
│   ├── transformer.ts
│   ├── transformer.test.ts          # Unit tests
│   ├── player.ts
│   ├── player.test.ts               # Unit tests (mocked)
│   ├── player.integration.test.ts   # Integration tests (real browser)
│   ├── yaml-schema.ts
│   └── yaml-schema.test.ts
├── utils/
│   ├── config.ts
│   ├── config.test.ts
│   ├── errors.ts
│   └── errors.test.ts
tests/
└── fixtures/
    ├── html/
    │   ├── simple-form.html
    │   ├── buttons.html
    │   └── assertions.html
    └── yaml/
        ├── valid-test.yaml
        ├── invalid-schema.yaml
        └── missing-element.yaml
```

## Test Coverage Details

### transformer.test.ts (Unit)

**Functions:**
- `jsonlToSteps()` - Parse JSONL to step array
- `actionToStep()` - Convert codegen action to step
- `stepsToYaml()` - Generate YAML from steps
- `yamlToTest()` - Parse YAML content

**Test Cases:**
- Valid JSONL with all action types (navigate, click, fill, press, check, uncheck, hover, select, assert*)
- Malformed JSON lines (should skip gracefully)
- Missing required fields (selector, url, text, etc.)
- Empty JSONL content
- Special characters in selectors and text
- YAML generation with/without description and baseUrl
- Proper YAML formatting (quotes, line width)

### yaml-schema.test.ts (Unit)

**Functions:**
- Zod schema validation for all step types
- Discriminated union on action field

**Test Cases:**
- Valid steps for each action type
- Invalid steps (missing required fields, wrong types)
- BaseUrl validation (must be valid URL format)
- Steps array validation (minimum 1 step required)
- Optional fields (description, checked flag)
- Type inference correctness

### player.test.ts (Unit - Mocked Playwright)

**Functions:**
- `resolveLocator()` - Convert selector string to Playwright locator
- `parseGetByArgs()` - Parse getBy* method arguments
- `stepDescription()` - Format step for display
- URL resolution logic in `executeStep()`

**Test Cases:**
- Parse `getByRole('button', { name: 'Submit' })`
- Parse `getByText('Welcome')`
- Parse `text=` selector
- Fallback to CSS selector
- Handle single and double quotes
- Relative URL with baseUrl
- Absolute URL (ignore baseUrl)
- Step description formatting

**Mocking:**
```typescript
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        locator: vi.fn(),
        getByRole: vi.fn(),
        getByText: vi.fn(),
        // ... other methods
      }),
      close: vi.fn()
    })
  }
}))
```

### player.integration.test.ts (Integration - Real Browser)

**Functions:**
- Full `play()` execution end-to-end

**Test Cases:**
- **Happy path**: Multi-step test (navigate → fill → click → assert) succeeds
- **Validation errors**: Invalid YAML structure rejected
- **Step failures**: Element not found, timeout, wrong assertion
- **Browser errors**: Missing Chromium installation
- **Options**: Headed vs headless, custom timeout
- **Failure handling**: Stop on first failure, report error
- **Result structure**: StepResult and TestResult correctness

**Fixtures:**
- Local HTTP server on `localhost:8888` serving HTML files
- Minimal HTML pages for each test scenario
- YAML test files with known inputs/outputs

### config.test.ts (Unit - Mocked fs)

**Functions:**
- `loadConfig()` - Load and parse config file

**Test Cases:**
- Load valid YAML config
- Load YML extension
- Missing config file (use defaults)
- Invalid YAML syntax
- Partial config (merge with defaults)

**Mocking:**
```typescript
vi.mock('node:fs/promises')
```

### errors.test.ts (Unit)

**Functions:**
- `UserError` class
- `ValidationError` class
- `handleError()` function

**Test Cases:**
- UserError with hint
- ValidationError with issues array
- handleError formats errors correctly
- handleError exits with code 1

## Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/bin/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },

    testTimeout: 30000,
    hookTimeout: 30000,
  }
})
```

### package.json Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
  "test:integration": "vitest run --include '**/*.integration.test.ts'",
  "test:coverage": "vitest run --coverage"
}
```

### Dependencies

```json
{
  "@playwright/test": "^1.58.2",
  "@vitest/coverage-v8": "^4.0.18"
}
```

## Test Fixtures

### HTML Fixtures (tests/fixtures/html/)

**simple-form.html:**
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Test Form</h1>
  <form>
    <input name="username" placeholder="Username" />
    <input name="password" type="password" placeholder="Password" />
    <button type="submit">Login</button>
  </form>
</body>
</html>
```

**buttons.html:**
```html
<!DOCTYPE html>
<html>
<body>
  <button id="btn1">Click Me</button>
  <button id="btn2" disabled>Disabled</button>
  <a href="#" role="button">Link Button</a>
</body>
</html>
```

**assertions.html:**
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Welcome</h1>
  <div id="status">Success</div>
  <input id="email" value="test@example.com" />
  <input type="checkbox" id="agree" checked />
</body>
</html>
```

### YAML Fixtures (tests/fixtures/yaml/)

**valid-test.yaml:**
```yaml
name: Valid Test
baseUrl: http://localhost:8888
steps:
  - action: navigate
    url: /simple-form.html
  - action: assertVisible
    selector: h1
```

**invalid-schema.yaml:**
```yaml
name: Invalid Test
steps:
  - action: click
    # Missing required selector field
```

### Fixture Server

Use Node's built-in HTTP server in `beforeAll`:

```typescript
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let server: ReturnType<typeof createServer>

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const filePath = join(__dirname, '../fixtures/html', req.url!)
    const content = await readFile(filePath, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(content)
  })
  await new Promise(resolve => server.listen(8888, resolve))
})

afterAll(() => server.close())
```

## Execution Strategy

### Development Workflow

1. **TDD for new features**: Write test first, then implementation
2. **Watch mode**: `npm run test:watch` during development
3. **Pre-commit**: Run unit tests (fast feedback)
4. **Pre-push**: Run full suite with coverage

### CI/CD Pipeline

```bash
# Install dependencies
npm ci

# Install Playwright browsers
npx playwright install chromium

# Run tests with coverage
npm run test:coverage

# Fail if coverage < 80%
# (vitest will exit with code 1 automatically)
```

### Test Execution Order

1. **Unit tests** (~5s) - Fast feedback on logic errors
2. **Integration tests** (~20s) - Validate browser behavior
3. **Coverage report** - Ensure thresholds met

## Success Criteria

- ✅ 80%+ code coverage for core modules
- ✅ All unit tests run in < 5 seconds
- ✅ All integration tests run in < 30 seconds
- ✅ Zero flaky tests (deterministic results)
- ✅ Clear error messages for failures
- ✅ Easy to add new tests (colocated, clear patterns)

## Future Enhancements

After initial implementation:
- Snapshot testing for YAML output formatting
- Performance benchmarks for large test files
- Visual regression testing for recorder UI
- Mutation testing to verify test quality
