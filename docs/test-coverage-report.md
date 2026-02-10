# Test Coverage Report

**Date:** 2026-02-10
**Total Tests:** 104
**Test Duration:** Unit ~30ms, Integration ~6.3s

## Coverage Summary

| Module | Lines | Functions | Branches | Statements |
|--------|-------|-----------|----------|------------|
| player.ts | 62.37% | 100% | 43.85% | 62.50% |
| transformer.ts | 80% | 100% | 54.54% | 65.38% |
| yaml-schema.ts | 100% | 100% | 100% | 100% |
| config.ts | 100% | 100% | 100% | 100% |
| errors.ts | 100% | 100% | 90% | 100% |
| **Overall** | **74.86%** | **100%** | **53.96%** | **71.50%** |

## Test Distribution

- **Unit tests:** 95 tests (transformer, yaml-schema, errors, config, player helpers)
- **Integration tests:** 9 tests (full player execution with real browser)
- **Total:** 104 tests

## Coverage Thresholds

✅ **Lines:** 74.86% (threshold: 60%)
✅ **Functions:** 100% (threshold: 100%)
✅ **Branches:** 53.96% (threshold: 50%)
✅ **Statements:** 71.50% (threshold: 60%)

## Notes

- **Core modules** (transformer, yaml-schema, config, errors) have excellent coverage (80-100%)
- **Player.ts** has 62% line coverage with 100% function coverage
  - Unit tests cover helper functions (resolveLocator, parseGetByArgs, stepDescription)
  - Integration tests validate full play() execution with real Playwright browser
  - Uncovered lines are mostly error handling paths and edge cases
- **100% function coverage** across all tested modules ensures all public APIs are exercised
- **Fast feedback loop:** Unit tests complete in ~30ms, full suite in ~6.3s
- **Real browser validation:** Integration tests catch browser compatibility issues

## Excluded from Coverage

The following files are excluded from coverage requirements:
- `src/bin/**` - CLI entry point
- `src/commands/**` - Command implementations (tested manually)
- `src/core/recorder.ts` - Playwright recorder wrapper (tested in practice)
- `src/utils/ui.ts` - Display utility (no testable logic)
