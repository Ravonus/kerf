<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/agent</h1>

<p align="center">
  <strong>An assistant that runs your Weft app: your server functions are its tools, and grants decide what it may do.</strong><br>
  Conversations, usage, tokens for outside agents over MCP, and bridges to Claude, the Claude CLI or your own Rust planner.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/agent"><img src="https://img.shields.io/npm/v/@weft-js/agent?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

## Quick start

```bash
weft add agent
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
- **MCP.** `/_weft/x/agent/mcp` serves the same tools to Claude Code, Codex or a script, with a token that never
  grants more than its creator holds.
- **Bridges.** `anthropic()` (the API with native tool use), `claudeCli()` (the local CLI, which calls tools over
  MCP), `rustBridge({ fn })` (any server function, such as a Rust sidecar) and `fakeBridge()` for tests.

Read the guide with `weft docs agent`, or in [`docs/agent.md`](./docs/agent.md).

## License

MIT
