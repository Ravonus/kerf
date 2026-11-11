# Agent

This is a plugin, `@weft-js/agent`, and nothing in weft names it. It gives an app an assistant that runs the site:
conversations you can rename, pin, archive and delete, tools that are your own server functions, grants per role and per
token, usage per conversation and token, and bridges to Claude, the local Claude CLI or your own planner.

`weft add agent` needs auth and a database. It writes:

- `src/agent.server.ts`: `defineAgent({ store, bridges, system, roles, user })`, which turns the extension on;
- `src/server/agent.ts`: the app's own queries, mutations and stream for conversations, turns, usage and tokens;
- `src/db/agent.schema.ts`: five tables, re-exported from `src/db/schema.ts`.

## Tools are functions that opt in

A query or mutation becomes a tool by saying so beside `auth`:

<!-- example: skip fragments of a server module -->

```ts
export const menu = query({
  auth: 'user',
  tags: ['menu'],
  agent: { say: 'The menu with prices in cents' },
  run: () => listMenu(),
})

export const setPrice = mutation({
  auth: { role: 'owner' },
  input: z.object({ item: z.string(), cents: z.int().min(0) }),
  invalidates: ['menu'],
  agent: { say: 'Change an item price', confirm: true },
  run: ({ input }) => updatePrice(input),
})
```

- The tool's name is the export name, its description is `say`, and its input is the function's input schema.
- Its permission is `<scope>.read` for a query and `<scope>.write` for a mutation. The scope is `agent.scope`, else the
  first tag (query) or `invalidates` entry (mutation), else the export name. Above: `menu.read` and `menu.write`.
- `confirm: true` holds each call until the owner approves or declines it in the conversation.
- `agent: true` opts in with the defaults.

A function without `agent:` is never a tool, and an agent can't reach it by any route (AGENT008).

## Grants

`roles` maps each role to what it may let the agent do:

<!-- example: skip needs what `weft add agent` writes -->

```ts
export default defineAgent({
  store,
  bridges: [anthropic(), claudeCli()],
  system: 'You run the shop for its owner.',
  roles: { owner: ['*'], staff: ['orders.*', 'menu.read'] },
  // the user a token acts as
  user: (id) => findUser(id),
})
```

- `*` is everything; `orders.*` or `orders` is every `orders` permission; `menu.write` covers `menu.read`.
- Without `roles`, every signed-in user grants `*`.
- Grants never widen `auth`: a tool call runs as the signed-in person, through the function's own `auth`, and then must
  also be granted. Staff with `*` still can't run an owner-only function.
- Only the outermost call is checked. What a tool calls in turn is the tool's own business.

## Conversations and turns

`send` saves what the person said and runs a turn: the bridge writes, asks for tools, gets their results and writes
again, until it is done, a call waits for the owner, or it runs out of `steps` (default 8). The reply is saved as one
message with its text, calls and results. The scaffolded `turn` stream carries it to the page as it is written.

`resolveCall({ conversation, call, approve })` answers a held call. The agent hears the result and goes on.

## Bridges

| Bridge               | Import                     | Runs tools                         | Available when             |
| -------------------- | -------------------------- | ---------------------------------- | -------------------------- |
| `anthropic()`        | `@weft-js/agent/anthropic` | the loop runs them                 | `ANTHROPIC_API_KEY` is set |
| `claudeCli()`        | `@weft-js/agent/cli`       | itself, over MCP with a turn token | `claude` is on PATH        |
| `rustBridge({ fn })` | `@weft-js/agent/rust`      | the loop runs them                 | always                     |
| `fakeBridge(script)` | `@weft-js/agent/test`      | either                             | always                     |

The first available bridge answers a new conversation. Each conversation keeps its own.

`rustBridge` turns any server function that takes `bridgeInput` and returns `bridgeOutput` into a bridge. Give it
`impl: remote('rust://planner')` and the Rust sidecar gets serde types for both:

<!-- example: skip fragments of a server module -->

```ts
import { bridgeInput, bridgeOutput } from '@weft-js/agent/rust'
import { rustBridge } from '@weft-js/agent/rust'

export const planner = mutation({
  input: bridgeInput,
  output: bridgeOutput,
  impl: remote('rust://planner'),
})

// src/agent.server.ts
const house = rustBridge({ fn: planner, label: 'House rules' })
defineAgent({ bridges: [anthropic(), house], … })
```

## Outside agents: MCP and tokens

The app is an MCP server at `/_weft/x/agent/mcp` (Streamable HTTP, JSON answers). `createToken({ name, grants })`
returns a secret once. Give it to Claude Code, Codex or a script as `Authorization: Bearer <secret>`:

```bash
claude mcp add --transport http shop \
  https://example.com/_weft/x/agent/mcp \
  --header "Authorization: Bearer wa_…"
```

- A token never grants more than its creator holds, when it's made or later: a demoted owner's tokens shrink with them.
- Tools with `confirm` are refused to tokens: approve those in the app.
- A token only works on the MCP endpoint (AGENT007). Revoke it with `revokeToken`.
- Tokens need `user` in `defineAgent`, to load the person a token acts as.

## Usage

Every bridge step records its model and input and output tokens, and every token's MCP call records one call.
`usage({ days })` returns the rows and totals by bridge and model, for this person's conversations and tokens.

## Testing

<!-- example: skip test fragment -->

```ts
import { memoryAgentStore } from '@weft-js/agent/server'
import { fakeBridge } from '@weft-js/agent/test'

const input = { item: 'latte', cents: 400 }
const setPrice = { tool: 'setPrice', input }
const bridge = fakeBridge([{ call: setPrice }, 'Done.'])
const agent = defineAgent({
  store: memoryAgentStore(),
  bridges: [bridge],
  system: '',
})
```

Each line answers one step: words, a call or calls, or a function of the turn. `bridge.turns` keeps what it was handed.
`memoryAgentStore()` is for dev and tests; a production server refuses it (AGENT010).

## Codes

| Code     | Status | Means                                           |
| -------- | ------ | ----------------------------------------------- |
| AGENT001 | 401    | Not signed in                                   |
| AGENT002 | 404    | No such conversation or token, or not yours     |
| AGENT003 | 503    | No bridge is available                          |
| AGENT004 | 422    | An empty message                                |
| AGENT005 | 409    | A held call answered twice                      |
| AGENT006 | 422    | A token with no grant its creator holds         |
| AGENT007 | 403    | A token used outside `/_weft/x/agent/mcp`       |
| AGENT008 | 403    | A tool call reached a function without `agent:` |
| AGENT009 | 403    | A tool call the grant doesn't allow             |
| AGENT010 | 500    | `memoryAgentStore()` on a production server     |
