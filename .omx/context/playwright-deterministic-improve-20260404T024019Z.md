# Task statement
Research whether this project can reliably and deterministically record Playwright-based UI tests and improve recorded tests (especially selectors and assertions), then implement architectural cleanup/deslop work to make the path more robust.

# Desired outcome
- Reliable recording flow grounded in Playwright best practices
- Deterministic post-record improvement path for selectors/assertions
- Simpler architecture with clearer boundaries and less incidental complexity
- Verified behavior via focused tests plus lint/typecheck/test evidence

# Known facts / evidence
- The current recorder already shells out to `playwright codegen --target playwright-test` and parses generated TypeScript back into YAML (`src/core/recorder.ts`, `src/core/transform/playwright-ast-transform.ts`).
- Auto-improve currently defaults to assertion source `snapshot-native` and policy `reliable` (`src/app/services/record-service.ts`).
- Improve replays the test in a fresh headless Chromium session, repairs selectors, and optionally derives assertions from deterministic heuristics plus `locator.ariaSnapshot()` snapshots (`src/core/improve/improve-runner.ts`, `src/core/improve/improve-selector-pass.ts`, `src/core/improve/improve-assertion-pass.ts`, `src/core/improve/step-snapshot-scope.ts`).
- Existing example improve reports already show runtime replay failures and snapshot fallbacks, suggesting the current post-record improve pass can be unstable in practice.
- Official Playwright docs say codegen is a quick-start tool that prioritizes role, text, and test-id locators; it can record only visibility/text/value assertions; it also supports `--load-storage`, `--save-storage`, emulation flags, and custom setup via `page.pause()` for non-standard contexts.
- Official Playwright best-practice docs recommend user-visible locators, web-first assertions, isolated tests, and avoiding third-party dependencies.

# Constraints
- No new dependencies unless clearly necessary (prefer none).
- Must follow repo guidance: write plan before cleanup/refactor, keep diffs small/reviewable/reversible, run lint/typecheck/tests.
- Use Exa and Ref MCP for external research.
- Prefer primary/official sources for technical claims.

# Unknowns / open questions
- Whether the current runtime replay architecture can ever be deterministic enough for auto-assertion generation on arbitrary external pages.
- Which minimal architectural changes yield the biggest reliability gain without rewriting the whole product.
- Whether recorded metadata should preserve more capture-time context so improve avoids re-deriving unstable state later.

# Likely codebase touchpoints
- `src/app/services/record-service.ts`
- `src/app/services/improve-service.ts`
- `src/core/recorder.ts`
- `src/core/recorder-codegen.ts`
- `src/core/transform/playwright-ast-transform.ts`
- `src/core/improve/**`
