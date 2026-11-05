# @weft-js/multiplayer

> **Early release (0.1.1).** APIs will change between minor versions.

Presence, cursors anchored to elements, a typed interaction relay and synced scroll on `channel`. A library, not a plugin.

```bash
npm install @weft-js/multiplayer
```

## End-to-end tests

From the repository, `pnpm --filter @weft-js/multiplayer test:e2e prepare <dir>` prepares a room;
`pnpm --filter @weft-js/multiplayer test:e2e run <dir>` runs it in two browsers. The entrypoint
stays `.mjs` because Node runs it directly, outside Vitest.
