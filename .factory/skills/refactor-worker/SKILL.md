---
name: refactor-worker
description: Handles code cleanup, restructuring, and standards improvements with zero behavior changes
---

# Refactor Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- Dead code removal (files, exports, directories)
- File moves and import path updates
- Module restructuring (extracting subdirectories)
- ESLint configuration changes and violation fixes
- Code consolidation (removing duplicates)
- Service/module refactoring (extracting responsibilities)
- Test file renaming/relocation

## Work Procedure

1. **Read the feature description thoroughly.** Understand exactly what needs to change and what the expected behavior is.

2. **Survey the affected files.** Before making any changes:
   - Read every file that will be modified or moved
   - Trace all imports to/from the affected files using `grep`
   - Identify every consumer that will need import path updates
   - Note any edge cases (re-exports, barrel files, dynamic imports)

3. **Write or update tests first (if applicable).** For restructuring:
   - If moving test files, read them and understand what they test
   - If renaming files, ensure test file names will match the new source file names
   - If extracting modules, consider if new test coverage is needed

4. **Make the changes incrementally.** For file moves:
   - Create new files at target locations first
   - Update all import paths across the entire codebase
   - Delete old files only after all imports are updated
   - Never have a state where imports point to non-existent files

5. **For import path updates after file moves:**
   - Search the ENTIRE `src/` directory for imports from the old path
   - Check both `.ts` source files and any config files
   - Remember: imports use `.js` extensions in this ESM project
   - Update the architecture test files if they reference specific paths

6. **Run quality gates after every logical change:**
   - `npm run lint` — must pass with zero warnings
   - `npm run typecheck:prod` — must compile cleanly
   - `npm test` — all tests must pass
   - If any gate fails, fix immediately before proceeding

7. **For ESLint rule changes:**
   - Add the rule to the config first
   - Run lint to see all violations
   - Fix violations systematically (by file or by pattern)
   - Run lint again to confirm zero warnings

8. **Final verification:**
   - `npm run quality:ci` — full quality gate
   - `npm run build` — production build
   - `npm run test:coverage` — verify coverage thresholds maintained

## Example Handoff

```json
{
  "salientSummary": "Extracted assertion-candidates/ subdirectory from improve/ — moved 7 files, updated 23 import paths across 15 files. All 617 tests pass, lint clean, architecture tests confirm no boundary violations.",
  "whatWasImplemented": "Created src/core/improve/assertion-candidates/ directory. Moved assertion-candidates.ts, assertion-candidates-inventory.ts, assertion-candidates-snapshot.ts, assertion-candidates-snapshot-candidate-builder.ts, assertion-candidates-snapshot-diff.ts, assertion-candidates-snapshot-native.ts, assertion-candidates-snapshot-parser.ts, assertion-candidates-snapshot-shared.ts, and their test files. Updated 23 import paths in 15 consumer files including improve-runner.ts, improve-assertion-pass.ts, improve-plan.ts, etc.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm run lint",
        "exitCode": 0,
        "observation": "Zero warnings, zero errors"
      },
      {
        "command": "npm run typecheck:prod",
        "exitCode": 0,
        "observation": "Clean compilation"
      },
      {
        "command": "npm test",
        "exitCode": 0,
        "observation": "617 tests passing, including architecture tests (layer boundaries + dependency cycles)"
      },
      {
        "command": "npm run build",
        "exitCode": 0,
        "observation": "Production build succeeds, dist/bin/ui-test.js exists"
      },
      {
        "command": "grep -rn 'assertion-candidates' src/core/improve/*.ts | grep -v assertion-candidates/",
        "exitCode": 1,
        "observation": "No assertion-candidates*.ts files remain in improve/ root (all moved to subdirectory)"
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": []
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A file move would break the layer boundary architecture in a way that can't be resolved
- A required refactoring reveals a deeper architectural issue that needs design decisions
- The feature scope is larger than expected (e.g., a move affects 50+ files unexpectedly)
- Quality gates fail in ways not related to the current feature's changes (pre-existing issues)
- Import cycle introduced that can't be resolved within the feature's scope
