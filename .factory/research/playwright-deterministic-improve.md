# Playwright deterministic improve research

Raw mission research notes captured before implementation.

## Sources reviewed

- Ref: Playwright codegen intro / running codegen
- Ref: Playwright best practices / generate locators
- Ref: Playwright ARIA snapshots / generating snapshots
- Exa: Playwright codegen CLI options, storage/emulation docs, locator generation behavior

## Key findings

- Playwright codegen prioritizes role, text, and test-id locators, and refines them when multiple matches exist.
- ARIA snapshots are useful for structure-aware validation, but snapshot generation is still runtime-coupled and should not be the primary source of post-recording mutation decisions.
- `--save-storage` / `--load-storage`, device emulation, and test-id configuration are first-class codegen inputs and should remain preserved by recording flows.
- For this mission, deterministic planning should come from recorded artifacts and persisted metadata first; runtime should confirm, reject, or annotate candidates rather than invent most changes.
