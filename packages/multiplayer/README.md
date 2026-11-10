# @weft-js/multiplayer

> **Not released yet.** This add-on is private and isn't on npm. An app made from a Weft checkout can use it: see
> [Using a Weft checkout](../../docs/getting-started.md).

Presence, cursors anchored to elements, a typed interaction relay and synced scroll on `channel`. A library, not a plugin.


## End-to-end tests

From the repository, `pnpm --filter @weft-js/multiplayer test:e2e prepare <dir>` prepares a room;
`pnpm --filter @weft-js/multiplayer test:e2e run <dir>` runs it in two browsers. The entrypoint
stays `.mjs` because Node runs it directly, outside Vitest.
