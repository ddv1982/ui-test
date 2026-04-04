# PRD: deterministic Playwright record/improve architecture

## Problem
`ui-test` wants to turn recorded Playwright flows into maintainable YAML tests and then improve those tests with better selectors and assertions. Today the core value is real, but the architecture still mixes deterministic transforms with browser-replay-heavy improvement logic, which makes defaults riskier than they should be and keeps `src/core/improve/**` harder to evolve.

## Goals
1. Make the default record -> improve path review-first and deterministic.
2. Keep Playwright codegen as the primary recording bootstrap.
3. Keep Chrome DevTools Recorder JSON as a supported secondary import path.
4. Reduce incidental complexity in `src/core/improve/**` through behavior-preserving extraction and boundary cleanup.
5. Preserve explicit advanced/runtime-heavy improvement modes for users who opt in.

## Non-goals
- Rewriting the whole product around a new recorder runtime.
- Adding new dependencies.
- Guaranteeing fully automatic, deterministic assertion generation for arbitrary third-party pages.
- Removing backward compatibility for legacy YAML selector `source` values in this pass.

## Constraints
- No new dependencies unless clearly necessary.
- Keep diffs small, reviewable, and reversible.
- Lock behavior with tests before/with refactors.
- Final claims require fresh lint, typed lint, prod typecheck, tests, and build evidence.
- Must stay aligned with official Playwright guidance: user-facing locators, web-first assertions, codegen as a bootstrap tool.

## User-facing outcomes
- Recording defaults to a review-first improve report instead of surprise mutation.
- Recorded/imported YAML flows go through one shared normalization/output path.
- Deterministic review modes avoid unnecessary browser launches.
- Advanced replay/snapshot improvement remains available when explicitly requested.

## Technical direction
- Continue treating Playwright codegen as primary capture.
- Separate deterministic orchestration from runtime analysis in `src/core/improve/**`.
- Extract pure orchestration helpers out of large runner modules.
- Keep runtime replay concentrated behind explicit execution planning.
- Normalize repeated YAML/test-document construction through shared helpers where possible.

## Acceptance criteria
- Canonical PRD and test-spec artifacts exist and drive ongoing Ralph execution.
- Record/import continue to work with shared normalization/output helpers.
- Default record auto-improve remains `report` with deterministic assertion sourcing.
- `improve-runner` and subsequent improve cleanup passes reduce complexity without behavior regressions.
- Full repo verification passes after each completed cleanup slice.

## Risks
- `src/core/improve/improve-assertion-pass.ts` remains a major complexity hotspot.
- `src/core/improve/locator-repair.ts` remains large and cross-cutting.
- Backward-compatibility support for legacy selector-source values may continue to leak old concepts into code/docs.
- Runtime analysis for dynamic external pages will still be inherently less deterministic than static transforms.

## Verification
- `npm run lint`
- `npm run lint:typed`
- `npm run typecheck:prod`
- `npm test`
- `npm run build`
