# Configuration

`ui-test` uses built-in defaults for all commands. Override any default with the corresponding CLI flag.

Run `ui-test <command> --help` to see all available flags.

For first-run setup and browser provisioning:

```bash
ui-test setup
```

## Play Defaults

| Setting | Default |
|---------|---------|
| `baseUrl` | `http://127.0.0.1:5173` |
| `testDir` | `e2e` |
| `--headed` | off (headless) |
| `--timeout <ms>` | 10000 |
| `--delay <ms>` | 0 |
| `--wait-network-idle` | on |
| `--save-failure-artifacts` | on |
| `--artifacts-dir <path>` | `.ui-test-artifacts` |
| `--browser <name>` | chromium |
| `--no-start` | off (auto-start enabled) |

Auto-start only applies to `e2e/example.yaml`.

## Record Defaults

| Setting | Default |
|---------|---------|
| `--output-dir <dir>` | `e2e` |
| `--selector-policy <policy>` | `reliable` |
| `--browser <browser>` | chromium |
| `--no-improve` | off (auto-improve enabled) |

## Improve Defaults

| Setting | Default |
|---------|---------|
| `--assertions <mode>` | `candidates` |
| `--assertion-source <source>` | `snapshot-native` |
| `--assertion-policy <policy>` | `balanced` |
| `--apply` / `--no-apply` | prompt (interactive) |
