# PRD: ui-test deterministic Playwright recording and improve architecture

## Problem
`ui-test` already records Playwright-driven flows and improves recorded YAML, but reliability and maintainability are limited by architectural drift and concentrated complexity in `src/core/improve/**`. The project needs a clearer Playwright-codegen-first recording story, safer review-first post-processing defaults, and simpler internal orchestration.

## Goals
- Make Playwright codegen the explicit primary recording path.
- Keep recorded YAML review-first by default; do not mutate immediately unless requested.
- Continue improving deterministic selector/assertion generation quality.
- Reduce orchestration complexity in `src/core/improve/**` through smaller pure helpers and shared utilities.
- Preserve backward compatibility for existing YAML and explicit apply flows.

## Non-goals
- Replacing Playwright with another automation engine.
- Removing legacy YAML support in this pass.
- Rewriting the entire improve subsystem in one step.

## Constraints
- No new dependencies.
- Small, reversible diffs.
- Full lint/typecheck/test/build verification after each cleanup pass.
- Keep CLI behavior backward compatible except where docs already define the intended default.

## User-facing outcomes
- `ui-test record` behaves as a review-first tool by default.
- DevTools Recorder import still works but is clearly secondary to Playwright codegen.
- Improve/report/apply flows remain stable while internal structure becomes easier to evolve.

## Technical direction
- Centralize recording normalization/output logic.
- Extract pure orchestration helpers from large improve modules.
- Keep runtime-sensitive behavior covered by regression/integration tests.
- Continue cleanup one hotspot at a time, prioritizing `improve-runner`, `improve-assertion-pass`, and `locator-repair`.

## Acceptance criteria
- Canonical record/import flow shares normalization/output infrastructure.
- Review-first auto-improve default is implemented and documented.
- At least one major improve-orchestration hotspot is simplified into smaller helpers.
- Fresh verification passes: lint, typed lint, prod typecheck, tests, build.

## Risks
- Subtle behavior drift in runtime replay/improve orchestration.
- Legacy selector source values complicate cleanup boundaries.
- Large improve modules may require multiple passes before they feel materially simpler.

## Verification
- `npm run lint`
- `npm run lint:typed`
- `npm run typecheck:prod`
- `npm test`
- `npm run build`
