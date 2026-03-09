# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

- Node.js >= 20.12.0 required
- TypeScript 5.9.x with strict mode
- ESM-only project (`"type": "module"` in package.json)
- Playwright is a runtime dependency (browser automation) but not needed for refactoring work
- No external services or API keys required for this mission
