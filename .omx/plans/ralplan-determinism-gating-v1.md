# RALPLAN: Determinism gating v1 for improve auto-apply

## Status
Approved via Planner → Architect → Critic consensus on 2026-04-04.

## Highest-value actionable risk
Runtime-heavy improve on arbitrary external/unstable pages can still auto-apply mutations that are less deterministic than they appear.

## Decision
Add a single v1 determinism capability gate owned by `src/core/improve/improve-runner.ts` that decides whether runtime-derived mutations may be auto-applied.

This gate is an **auto-apply safety boundary**, not a claim that a run is globally deterministic.

## RALPLAN-DR summary
### Principles
- Prefer explicit guardrails over heuristic optimism.
- Centralize policy decisions.
- Suppress risky auto-apply, not useful reporting.
- Keep v1 minimal and reversible.

### Decision drivers
1. Reliability of auto-apply
2. Architectural clarity
3. Small reversible scope

### Viable options
#### Option A — Central capability gate in improve-runner
Pros: smallest change; easy to test; clear boundary
Cons: does not solve every long-term runtime nondeterminism issue

#### Option B — Deeper per-subsystem gating first
Pros: finer control
Cons: more complexity; broader diff surface; weaker v1 clarity

### Chosen
Option A.

### Why not the others now
- Option B is better only if we already know we need different safety rules in multiple subsystems. We do not have evidence for that yet.
- A richer multi-state model would add semantics and branching before the codebase has a stable safety contract to hang them on.

## Capability model
Single centralized resolver near `improve-runner`:
- `allowRuntimeDerivedApply`
- `allowRuntimeSelectorRepairApply`
- `allowRuntimeAssertionApply`
- `emitDeterminismDiagnostics`

`allowRuntimeDerivedApply` is the parent source of truth; narrower flags should derive from it unless a real independent need appears.

Implementation note:
- keep policy ownership centralized in `improve-runner`
- extract the resolver into a small pure helper only if needed for testability/readability
- do not let downstream modules invent separate determinism policy

## Safe vs unsafe rule (v1)
Only two states in v1: `safe` and `unsafe`.

Mark a run `unsafe` when any of these hold:
1. missing or unknown `baseUrl`
2. replay/runtime host not equal to configured/known base host
3. cross-origin drift observed during runtime replay relative to configured/known base host
4. mutation provenance is runtime-only evidence

Definitions:
- Non-owned host: replay/runtime host not equal to configured/known base host; no semantic ownership inference
- Runtime-only evidence: mutation provenance from runtime selector regeneration, runtime uniqueness checks, snapshot-native diffs, or runtime-failure classification
- Cross-origin drift: observed replay navigation state crossing origin relative to configured/known base host

Non-goals for v1:
- no attempt to infer true business ownership of arbitrary hosts
- no user override flag yet
- no multi-state taxonomy beyond `safe` / `unsafe`
- no suppression of deterministic/static report generation

## Unsafe behavior
When `unsafe`:
- suppress auto-apply of runtime-derived selector repairs
- suppress auto-apply of runtime-derived assertions
- suppress other runtime-derived mutation classes through apply-time gating as needed
- still generate report candidates and diagnostics
- keep deterministic/static suggestions where valid
- never silently downgrade behavior

Suppression happens at apply-time, not generation-time.

## Reporting requirements
Add one canonical report field for determinism status/reasons, plus explicit diagnostics for:
- why the run was unsafe
- which mutation classes were suppressed
- what remained report-only

Preferred shape:
- one report summary/status field for determinism safety
- one machine-readable list of reason codes
- diagnostics that point to the specific suppressed mutation class

## ADR
### Drivers
- Arbitrary external pages remain nondeterministic
- Runtime-derived mutations are the riskiest remaining behavior
- Need one clear architectural boundary in v1

### Alternatives considered
- Multi-state taxonomy (`safe` / `runtime-assisted` / `unsafe`) — rejected for v1 as too behavior-heavy
- Diagnostics-only — rejected because risky auto-apply would remain unchanged
- Per-module policy scattering — rejected because it weakens maintainability and auditability
- Full runtime rewrite / capture-context redesign — rejected for now as too broad for the current highest-value fix

### Why chosen
This reduces the highest-value actionable risk with the smallest coherent change.

### Consequences
- Safer apply behavior on external/unstable pages
- More explicit reporting
- Slightly less aggressive automation
- Possible false negatives where a stable external page is treated as report-only

### Follow-ups
- Optional override mode later
- Possible richer ownership/origin model later
- Future maintainability pass across `src/core/improve/**`

## Acceptance criteria
1. Missing baseUrl scenario
   - runtime-derived selector/assertion mutations are not auto-applied
   - report still contains candidates and determinism diagnostics
2. External host scenario
   - runtime-derived apply is suppressed
   - deterministic/static suggestions still appear when available
3. Cross-origin drift scenario
   - runtime-derived apply is suppressed
   - diagnostic records drift and suppression
4. Safe local-owned scenario
   - existing runtime-derived apply path still works
5. No silent downgrade
   - every suppression path emits explicit diagnostic/report evidence
6. No policy sprawl
   - downstream modules consume capabilities and do not invent separate determinism rules
7. Policy is testable as a unit
   - the safe/unsafe resolver can be exercised without launching a browser

## Verification
Scenario-specific:
- unit: capability resolver safe/unsafe classification
- runner: missing baseUrl suppresses runtime-derived apply
- runner: external host suppresses runtime-derived apply
- runner: cross-origin drift suppresses runtime-derived apply
- runner: safe local flow still applies runtime-derived mutations
- runner: deterministic/static candidates still survive when runtime-derived apply is suppressed
- runner/report: suppression emits explicit reason codes and diagnostics

Repo-wide:
- `npm run lint`
- `npm run lint:typed`
- `npm run typecheck:prod`
- `npm test`
- `npm run build`

## Execution handoff
### Available agent types
- `planner` — sequencing / scope control
- `architect` — boundary review / policy placement
- `executor` — implementation
- `test-engineer` — scenario and regression coverage
- `verifier` — completion evidence / final validation
- `writer` — docs/help text updates

### Ralph
Recommended owner: `executor` (high reasoning)
Optional checks: `verifier` (high), `test-engineer` (medium)
Sequence:
1. add focused regression tests for the gating contract
2. implement capability resolver
3. integrate gate into `improve-runner` apply-time decisions
4. add diagnostics/report metadata
5. adjust focused docs if the user-facing behavior changes
6. full verification

Suggested launch:
- `$ralph implement .omx/plans/ralplan-determinism-gating-v1.md`
- Reasoning by lane:
  - implementation: high
  - focused test work: medium
  - final verification: high

### Team
Lanes:
1. Core guardrails — `executor` (high)
2. Tests — `test-engineer` (medium)
3. Docs — `writer` or `executor` (low)

Team verification path:
- land core/tests together
- validate scenario tests
- run full repo verification before completion

Suggested launch:
- `$team implement .omx/plans/ralplan-determinism-gating-v1.md`
- or `omx team` with lanes:
  - lane 1: core guardrails / capability resolver / runner integration
  - lane 2: scenario tests + regression checks
  - lane 3: docs/help text updates

## Architect review
- Strongest antithesis: origin/baseUrl is only a proxy for determinism; a local page can still be unstable, while an external page can be stable. If the gate is oversold as “determinism”, it risks becoming a misleading policy layer instead of a narrowly useful safety boundary.
- Real tradeoff tension: centralized simplicity vs. precision. A small central gate is easier to reason about, but it will intentionally produce conservative false negatives.
- Synthesis: keep the centralized gate, but explicitly scope it to **auto-apply safety** for runtime-derived mutations and keep deterministic/static suggestions flowing through report-only paths.
- Verdict: APPROVE

## Critic review
- Quality check: passes if v1 stays small, explicit, and test-first.
- Must preserve: no silent downgrade, no per-module rule drift, no broad taxonomy/override work in v1.
- Concrete success shape: five scenario tests plus full repo verification.
- Verdict: APPROVE
