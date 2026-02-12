#!/usr/bin/env node

const lines = [
  "ui-test command guide",
  "",
  "Most common commands",
  "  npm run help                     Show this guide",
  "  npx ui-test setup              First-run setup (config + Chromium)",
  "  npx ui-test play               Run YAML browser tests",
  "  npx ui-test record             Record a new YAML test",
  "  npx ui-test list               List discovered YAML tests",
  "",
  "If app already running",
  "  npx ui-test play --no-start    Skip auto-start and run against running app",
  "",
  "Development/Maintainer",
  "  npm test                        Framework test suite (Vitest)",
  "  npm run test:framework          Same as npm test",
  "  npm run test:smoke              Consumer smoke flow (setup -> play)",
  "  npm run test:unit               Unit tests only",
  "  npm run test:integration        Integration tests only",
  "  npm run test:coverage           Coverage run",
  "  npm run check:npm-name          Check npm name availability",
  "",
  "More help",
  "  npx ui-test --help",
  "  npx ui-test play --help",
];

process.stdout.write(`${lines.join("\n")}\n`);
