<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/agent</h1>

<p align="center">
  <strong>An assistant that runs your Kerf app: your server functions are its tools, and grants decide what it may do.</strong><br>
  Conversations, usage, tokens for outside agents over MCP, and bridges to the Rust bridge daemon, Claude, the Claude CLI or your own planner.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/agent"><img src="https://img.shields.io/npm/v/@kerf-js/agent?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

## Quick start

```bash
kerf add agent
```

It writes `src/agent.server.ts`, `src/server/agent.ts` and `src/db/agent.schema.ts`. Then mark the functions the
assistant may use:

<!-- example: skip fragments of a server module -->

```ts
export const setPrice = mutation({
  auth: { role: 'owner' },
  input: z.object({ item: z.string(), cents: z.int().min(0) }),
  invalidates: ['menu'],
  agent: { say: 'Change an item price', confirm: true },
  run: ({ input }) => updatePrice(input),
})
```

That's a tool named `setPrice` needing `menu.write`, held for the owner's approval on each call.

## What it does

- **Tools from your functions.** Any query or mutation with `agent:` is a tool, typed by its input schema. Nothing
  else is.
- **Grants.** `roles: { owner: ['*'], staff: ['orders.*', 'menu.read'] }`. A call runs as the person asking, through
  the function's own `auth`, and must also be granted.
- **Conversations.** Start, rename, pin, archive, delete. Replies stream to the page; held calls wait for approval.
- **Usage.** Input and output tokens per step, by bridge and model, and calls per token.
- **MCP.** `/_kerf/x/agent/mcp` serves the same tools to Claude Code, Codex or a script, with a token that never
  grants more than its creator holds.
- **Bridges.** `rustBridge()` (the Technomancy AI Bridge daemon and its signed-in CLIs), `anthropic()` (the API
  with native tool use), `claudeCli()` (the local CLI, which calls tools over MCP), `fnBridge({ fn })` (any server
  function) and `fakeBridge()` for tests. `AGENT_BRIDGE=<id>` picks the default; each conversation can swap.

Read the guide with `kerf docs agent`, or in [`docs/agent.md`](./docs/agent.md).

## License

MIT
