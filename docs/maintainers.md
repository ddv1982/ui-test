# Maintainers

This guide covers maintainer-focused workflows and CI details.

## Test Commands

```bash
npm run setup
npm run lint
npm run lint:typed
npm run typecheck:prod
npm test
npm run quality:ci
npm run test:parity:headed
npm run test:flake:soak
npm run test:coverage
npm run build
npm run test:smoke
npm run quality:release
```

`npm test` includes architecture boundary checks (see `src/architecture/layer-boundaries.test.ts`).

Optional strictness ratchet for tests:

```bash
npm run typecheck:test
```

Run `typecheck:test` before release changes that touch tests or test-only helpers.

## Packaging Validation

Before creating or consuming a packaged release artifact:

```bash
npm run build
npm run pack:check:silent
npm run global-install:dry-run
npm run global-install:smoke
npm run test:smoke
```

Release preflight:

```bash
npm run quality:release
```

The package is marked `private: true` to prevent accidental publication to the public npm registry. Releases are distributed as GitHub Release `.tgz` assets built with `npm pack`.

## Release Process

1. Bump `package.json` and `package-lock.json` together in a release PR.
2. Merge the release PR after CI passes.
3. Create and publish a GitHub Release from `main` using tag `vX.Y.Z`, where `X.Y.Z` matches `package.json`.
4. The `Release` workflow validates the tag with `npm run release:assert-tag`, runs `npm run quality:release`, packs the project, generates a SHA-256 checksum, and uploads both files to the GitHub Release.

The release workflow does not run `npm publish` and does not require npm registry credentials. Configure the `github-release` environment in GitHub repository settings if you want required reviewer approval before release assets are built and uploaded.

To check a tag locally before publishing a release:

```bash
GITHUB_REF_NAME=v0.1.0 npm run release:assert-tag
```

## CI Workflows

This repository ships GitHub Actions workflows under `.github/workflows`:

- `CI`: runs on pull requests, pushes to `main`, and manual dispatch. It runs browser-backed quality gates on Node `20.12.x` and `22.x`, provisions Chromium with Playwright's Linux installer, runs coverage/headed parity/consumer smoke on Node `22.x`, and keeps build/package/install smoke coverage across Node `20.12.x`, `22.x`, and `24.x`.
- `Release`: runs when a GitHub Release is published. It builds from the release tag, validates the tag/version match, runs the full release gate, packs the project, and uploads the tarball plus `.sha256` checksum to the release.
- `Release Package`: runs on version tags or manual dispatch to build and upload a workflow artifact only. It does not create GitHub Releases or upload release assets; release assets are published exclusively by the `Release` workflow after `release:assert-tag` and `quality:release` pass.

Recommended future CI coverage:

- Add release artifact provenance/attestations if this repository starts distributing externally.

Optional soak workflow:

- A scheduled/manual multi-iteration integration soak that runs `npm run test:flake:soak` and uploads the JSON failure-rate report artifact.

## Recorder Architecture Note

The current recorder is Playwright-codegen-first. Chrome DevTools Recorder JSON remains supported as an import path, and legacy YAML may still contain older `codegen-jsonl` / `codegen-fallback` source tags.

## Coverage Thresholds

Configured in `vitest.config.ts`:
- Lines: 82%
- Functions: 90%
- Branches: 65%
- Statements: 80%

See snapshot notes in `docs/test-coverage-report.md`.

## Legal / Notices

- Project license: MIT (`LICENSE`)
- Playwright attribution: `THIRD_PARTY_NOTICES.md`
