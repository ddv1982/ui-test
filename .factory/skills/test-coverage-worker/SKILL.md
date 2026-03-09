---
name: test-coverage-worker
description: Writes comprehensive tests to improve coverage for under-tested modules
---

# Test Coverage Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that require writing new test cases to improve coverage for specific source files. The goal is to bring statement coverage to >= 80% for targeted files.

## Work Procedure

1. **Read the target source file completely.** Understand:
   - Every exported function and its purpose
   - All code paths (happy path, error paths, edge cases)
   - Input types and return types
   - Dependencies and how they're used
   - Which paths are currently uncovered (run coverage first)

2. **Run current coverage for the target file:**
   ```bash
   npm run test:coverage
   ```
   Note the current statement/branch/function coverage percentages. Identify which lines are uncovered.

3. **Read existing tests** (if any) for the target file. Understand:
   - What's already tested
   - Testing patterns used (mocking strategy, fixture setup)
   - What test helpers or fixtures are available

4. **Plan test cases.** For each uncovered code path, plan a test:
   - Name the test descriptively (what behavior does it verify?)
   - Identify the input needed to trigger that path
   - Identify the expected output/side-effect
   - Note any mocks needed

5. **Write tests FIRST (red phase).** Create the test file (or add to existing):
   - Follow the project's test patterns: `describe`/`it`/`expect`
   - Use `vi.resetAllMocks()` in `beforeEach`
   - Group tests logically by function or behavior area
   - Cover: happy paths, error paths, edge cases, boundary conditions
   - Write tests that would FAIL without the implementation

6. **Verify tests pass (green phase):**
   ```bash
   npm test
   ```
   All new AND existing tests must pass.

7. **Check coverage improvement:**
   ```bash
   npm run test:coverage
   ```
   Verify the target file's statement coverage >= 80%. If not, identify remaining uncovered paths and add more tests.

8. **Iterate** until the target meets >= 80% statement coverage.

9. **Final verification:**
   - `npm run quality:ci` — full quality gate
   - `npm run test:coverage` — confirm coverage target met and global thresholds maintained

## Test Writing Guidelines

- **Test behavior, not implementation.** Test what a function does, not how it does it.
- **Minimize mocking.** Mock only external dependencies (file system, network, browser). Prefer real objects where possible.
- **Use descriptive test names.** `it("returns empty array when no candidates match threshold")` not `it("works")`
- **Test error paths.** If a function can throw, test that it throws the right error with the right message.
- **Test edge cases.** Empty arrays, undefined optionals, boundary values, very long strings.
- **Match existing patterns.** Look at sibling test files for mocking patterns, fixture setup, and assertion styles.
- **No `any` in tests** unless truly necessary (project convention allows it but prefer typed).

## Example Handoff

```json
{
  "salientSummary": "Added 12 unit tests for step-executor.ts covering navigate, fill, press, hover, select, assertVisible, assertText, assertValue, and assertChecked actions. Coverage improved from 41.77% to 84.2% statements. All 629 tests pass.",
  "whatWasImplemented": "Created src/core/runtime/step-executor.test.ts with 12 new test cases organized in 4 describe blocks: 'navigation actions' (navigate with url), 'form interaction actions' (fill, press, select), 'mouse actions' (hover, click timeout handling), and 'assertion actions' (assertVisible, assertText, assertValue, assertChecked with both true/false states). Mocked Page and Locator objects following patterns from existing locator-runtime.test.ts.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm run test:coverage 2>&1 | grep step-executor",
        "exitCode": 0,
        "observation": "step-executor.ts: 84.2% stmts, 76.3% branches, 100% funcs, 87.1% lines"
      },
      {
        "command": "npm run quality:ci",
        "exitCode": 0,
        "observation": "All quality gates pass: lint clean, typecheck clean, 629 tests passing"
      },
      {
        "command": "npm run test:coverage 2>&1 | tail -5",
        "exitCode": 0,
        "observation": "Global coverage: 84.1% stmts, 71.2% branches, 96.1% funcs, 88.0% lines — all above thresholds"
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "src/core/runtime/step-executor.test.ts",
        "cases": [
          { "name": "navigate: navigates to URL and waits for load", "verifies": "navigate action calls page.goto with correct URL" },
          { "name": "fill: fills input with specified value", "verifies": "fill action locates element and fills with text" },
          { "name": "press: presses specified key", "verifies": "press action calls locator.press with key" },
          { "name": "hover: hovers over element", "verifies": "hover action calls locator.hover" },
          { "name": "select: selects option by value", "verifies": "select action calls locator.selectOption" },
          { "name": "assertVisible: passes when element visible", "verifies": "assertVisible with visible element succeeds" },
          { "name": "assertVisible: fails when element not visible", "verifies": "assertVisible with hidden element throws" },
          { "name": "assertText: matches exact text", "verifies": "assertText compares element textContent" },
          { "name": "assertValue: matches input value", "verifies": "assertValue checks input element value" },
          { "name": "assertChecked: true when checked", "verifies": "assertChecked passes for checked checkbox" },
          { "name": "assertChecked: false when unchecked", "verifies": "assertChecked passes for unchecked checkbox" },
          { "name": "unknown action: throws descriptive error", "verifies": "unrecognized action type produces clear error" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The target file has been restructured/moved and its path doesn't match the feature description
- The target file's code is too tightly coupled to browser APIs to unit test without massive mocking (suggest integration test approach instead)
- Existing tests are failing before adding new tests (pre-existing issue)
- Coverage cannot reach 80% because large portions of code require browser integration testing
