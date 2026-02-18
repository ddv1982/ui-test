# ui-test

`ui-test` is a YAML-first E2E runner built on Playwright.
Record flows, replay them, and improve selector/assertion quality with a review-first pipeline.

## Quick Start

**Repository checkout:**
```bash
npm run setup
```

**Global install:**
```bash
npm i -g "$(npm pack github:ddv1982/easy-e2e-testing --silent)"
ui-test setup --browsers chromium
```

**One-off run (no install):**
```bash
npx -y github:ddv1982/easy-e2e-testing setup --browsers chromium
```

All command examples below use global `ui-test`.

## Core Commands

| Command | Purpose |
| --- | --- |
| `ui-test setup` | Onboarding and provisioning helper |
| `ui-test play [test]` | Run one YAML test or all tests |
| `ui-test record` | Record browser interactions into YAML |
| `ui-test improve <file>` | Improve selectors and add assertions |
| `ui-test list` | List discovered tests |
| `ui-test doctor` | Show invocation/version diagnostics |

## Play Defaults

| Flag | Default |
|------|---------|
| `--headed` | off (headless) |
| `--timeout <ms>` | 10000 |
| `--delay <ms>` | 0 |
| `--wait-network-idle` | on |
| `--save-failure-artifacts` | on |
| `--artifacts-dir <path>` | `.ui-test-artifacts` |
| `--browser <name>` | chromium |
| `--no-start` | off (auto-start enabled) |

`testDir=e2e`, `baseUrl=http://127.0.0.1:5173`. Auto-start applies to `e2e/example.yaml` only.

See `ui-test <command> --help` or the workflow docs for all flags.

## Troubleshooting

- Browser missing: `npx playwright install chromium`
- Linux dependencies missing: `npx playwright install-deps chromium`
- Example app not reachable (example test auto-start): verify `http://127.0.0.1:5173` or run `ui-test play --no-start`

Full guide: [Troubleshooting](docs/troubleshooting.md)

## Documentation

- [Getting Started](docs/getting-started.md)
- [Record Workflow](docs/workflows/record.md)
- [Improve Workflow](docs/workflows/improve.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Maintainers](docs/maintainers.md)

## Third-Party Licenses

`ui-test` uses Microsoft Playwright for automation/recording.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT
