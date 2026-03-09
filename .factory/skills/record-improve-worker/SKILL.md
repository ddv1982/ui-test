---
name: record-improve-worker
description: Implement deterministic record/improve architecture and parity-hardening features with TDD and focused CLI/runtime verification.
---

# Record Improve Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use this skill for features that modify any of the following:
- `src/app/services/record-service.ts`
- `src/app/services/improve-service.ts`
- `src/core/recorder.ts`
- `src/core/recording/**`
- `src/core/improve/**`
- `src/core/player*`
- `scripts/run-headed-parity.*`
- related Vitest coverage for deterministic plan/apply, runtime safety, or headed parity

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, `validation-contract.md`, and your assigned feature in `features.json`. Only claim success for the assertions listed in that feature's `fulfills`.
2. Inspect the exact files and tests already covering the behavior. Identify the smallest set of tests to drive the feature.
3. Add or update failing tests first. Separate the red step from implementation. Cover both positive behavior and safety/failure paths.
4. Implement the feature using existing TypeScript/Vitest patterns. Prefer deterministic planning/data flow over new runtime-only heuristics.
5. If the feature touches candidate selection, runtime failure classification, or plan/apply behavior, preserve or improve diagnostic/report clarity.
6. Run focused validators for the changed area first. Then run any broader commands required by the feature's verification steps.
7. Perform one manual or CLI-level sanity check whenever the feature changes user-facing command behavior. If you run a built `dist` entrypoint, run an explicit build first; otherwise prefer source-backed validation paths. Record exactly what you ran and what you observed.
8. Before handing off, verify there are no unrelated file edits in your diff. Do not revert unrelated user changes.

## Example Handoff

```json
{
  "salientSummary": "Implemented deterministic plan payload application for improve and added drift/moved-file coverage. `--apply-plan` now writes the reviewed plan payload directly, warns when the file moved with matching content, and fails closed on source drift.",
  "whatWasImplemented": "Updated improve service/plan handling so apply-plan uses the reviewed plan payload without re-running recommendation logic, added SHA-256 and relocation-path coverage, and expanded report/plan tests plus service-level CLI behavior tests.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "vitest run src/app/services/improve-service.test.ts src/core/improve/improve-plan.test.ts",
        "exitCode": 0,
        "observation": "Plan generation/apply-plan tests passed, including moved-file warning and source-drift failure coverage."
      },
      {
        "command": "npm run typecheck:test",
        "exitCode": 0,
        "observation": "TypeScript checks passed after the service and plan schema changes."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Ran the improve CLI on a controlled fixture with `--plan`, then `--apply-plan`.",
        "observed": "Plan and report were created without mutating the source file; applying the plan wrote the expected YAML and did not regenerate a new recommendation set."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/app/services/improve-service.test.ts",
        "cases": [
          {
            "name": "applies a reviewed plan to moved but fingerprint-matching content with warning",
            "verifies": "Relocated source files can receive a reviewed plan without re-inference when content still matches the plan fingerprint."
          },
          {
            "name": "fails closed when apply-plan source fingerprint does not match",
            "verifies": "Drifted input is not overwritten by stale plan application."
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The feature requires changing mission scope or validation assertions.
- A needed deterministic fixture or parity surface is broken in a way unrelated to this mission's scope.
- The feature cannot be completed without violating mission boundaries or touching unrelated dirty files.
- Headed parity or Playwright runtime prerequisites become unavailable in the environment.
