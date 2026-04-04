# Third-Party Notices

This project includes and uses third-party software.

## Overview

The published `ui-test` npm package depends on a small set of direct runtime
libraries distributed under their own licenses.

- Direct runtime dependencies currently include packages such as
  `@inquirer/prompts`, `acorn`, `chalk`, `commander`, `globby`, `js-yaml`,
  `ora`, `playwright`, and `zod`.
- Most of these direct runtime dependencies are MIT-licensed.
- Playwright is the primary direct runtime dependency under Apache License 2.0.

When users install `ui-test` from npm, npm also installs those dependencies as
separate packages together with their own package metadata and license files.
This notices file highlights the most significant non-MIT runtime dependency
used by the project.

## Playwright

- Package(s): `playwright`, `playwright-core`, `@playwright/test`
- Copyright: Microsoft Corporation
- License: Apache License 2.0 (`Apache-2.0`)
- Source: https://github.com/microsoft/playwright
- License text: https://github.com/microsoft/playwright/blob/main/LICENSE

This project uses Playwright libraries and the Playwright CLI entry points
shipped with the installed `playwright` package for:

- Browser automation and playback
- Test recording via `codegen`
- Browser dependency installation in setup/CI flows
- Aria snapshots for assertion candidate generation in `improve`
