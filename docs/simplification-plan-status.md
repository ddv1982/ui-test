# Simplification Plan Status

This document tracks delivery status for the Vue-first simplification effort.

## Status Table

| Item | Status | Notes |
| --- | --- | --- |
| Vue-first onboarding UX | Achieved | `init` defaults target local Vue example app flow. |
| Keep core commands (`init`, `play`, `record`, `list`) | Achieved | Command surface remains intact and focused. |
| Keep runtime controls (`timeout`, `delay`, `headed`) | Achieved | Config + CLI flags remain supported. |
| Support one-command example run path | Achieved | `play` auto-starts via `startCommand` when configured. |
| Cross-platform one-command onboarding setup | Achieved | `setup` plus `npm run bootstrap:*` provide shell-neutral onboarding across platforms. |
| Simplify `play` startup logic | Achieved | Removed pre-parse multi-file URL reachability complexity. |
| Add `--no-start` manual override | Achieved | Users can run against an already-running app. |
| Keep safe locator-expression support | Achieved | Allowlisted locator parsing remains in place. |
| Vue-only quickstart/docs | Achieved | README now centers on Vue example startup path and command split. |
| Canonical startup command choice | Adjusted | Uses `ui-test example-app ... || npx -y github:ddv1982/easy-e2e-testing example-app ...` so local/global installs are preferred while one-off fallback remains available before npm publish. |
| CI coverage for user onboarding flow | Achieved | Added smoke path (`init --yes` -> `play`) via CI plan and scripts. |

## Adjustment Rationale

The original simplification direction referenced a repo-local startup script pattern. That is convenient inside this repository but brittle for consumers installing from package tarballs or GitHub.

Using a composite `startCommand` (`ui-test ... || npx -y github:...`) avoids hard runtime network dependency for global/local users while still providing a one-off fallback before npm publish.
