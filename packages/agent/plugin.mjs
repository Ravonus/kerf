// agent() for weft.config.ts: the app's assistant. Server functions opt in as tools with `agent:`, grants decide what
// it may do, conversations and usage live in the app's database, and the app speaks MCP at /_weft/x/agent/mcp for
// agents outside it. Built like `@weft-js/pay`: one pure manifest, the server part behind the slot's lazy load.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'
import { setup } from './src/setup.mjs'

const extension = defineSlot({
  id: 'server.extension',
  version: 1,
  cardinality: 'keyed',
  sides: ['server'],
})

const diagnostics = [
  [
    'AGENT001',
    'error',
    'The assistant used by someone signed out',
    "Every agent function is `auth: 'user'`",
  ],
  [
    'AGENT002',
    'error',
    "A conversation or token that isn't the caller's",
    'Only its owner reads or changes it',
  ],
  [
    'AGENT003',
    'error',
    'No bridge can answer here',
    'Start the Rust bridge daemon, set ANTHROPIC_API_KEY, or sign in to the `claude` CLI',
  ],
  ['AGENT004', 'error', 'An empty message', 'Say something first'],
  ['AGENT005', 'error', 'A held call answered twice', 'Each is approved or declined once'],
  [
    'AGENT006',
    'error',
    'A token with nothing its creator may grant',
    'Give it grants you hold yourself',
  ],
  [
    'AGENT007',
    'error',
    'A token used on `/_weft/fn/` directly',
    'Agents call tools through `/_weft/x/agent/mcp`',
  ],
  [
    'AGENT008',
    'error',
    "A tool call to a function that didn't opt in",
    "Add `agent: { say: '…' }` to it",
  ],
  [
    'AGENT009',
    'error',
    "A tool call the grant doesn't allow",
    'Grant its permission (`scope.read` / `scope.write`) to the role or token',
  ],
  [
    'AGENT010',
    'error',
    '`memoryAgentStore()` on a production server',
    '`drizzleAgentStore(db, tables)`, or your own `AgentStore`',
  ],
].map(([code, severity, catches, fix]) => ({ code, severity, catches, fix }))

export const agent = definePlugin({
  name: '@weft-js/agent',
  version: '0.1.0',
  weft: '*',
  namespace: 'AGENT',
  permissions: {
    net: ['api.anthropic.com'],
    env: ['ANTHROPIC_API_KEY', 'AGENT_BRIDGE', 'AGENT_BRIDGE_TOKEN'],
    spawn: ['claude'],
  },
  contribute: () => ({
    provides: [
      provide(extension, {
        key: 'agent',
        sides: { server: { module: '@weft-js/agent/server', export: 'extension' } },
      }),
    ],
    diagnostics,
    docs: {
      topic: 'agent',
      summary:
        "The app's assistant: tools from server functions, grants, conversations, usage, MCP, bridges; AGENT-codes",
      file: new URL('./docs/agent.md', import.meta.url).pathname,
    },
    setup,
    agents: {
      title: 'Assistant',
      text: "A query or mutation becomes an assistant tool with `agent: { say: '…' }` beside `auth`; add `confirm: true` where the owner should approve each call, and `scope` to name its permission (`menu` → `menu.read` / `menu.write`). Tools run as the signed-in person, through their `auth`, and only when the grant allows. Roles map to grants in `src/agent.server.ts`; tokens for outside agents use `/_weft/x/agent/mcp`. `weft docs agent`.",
    },
    catalog: [
      {
        name: 'defineAgent',
        import: '@weft-js/agent/server',
        summary: 'The assistant: src/agent.server.ts default-exports it',
      },
      {
        name: 'anthropic',
        import: '@weft-js/agent/anthropic',
        summary: 'Answer through the Anthropic API, with tool use',
      },
      {
        name: 'claudeCli',
        import: '@weft-js/agent/cli',
        summary: 'Answer through the local claude CLI, tools over MCP',
      },
      {
        name: 'rustBridge',
        import: '@weft-js/agent/rust',
        summary: 'Answer through the Rust bridge daemon and its signed-in CLIs',
      },
      {
        name: 'fnBridge',
        import: '@weft-js/agent/fn',
        summary: 'Answer through your own server function',
      },
      { name: 'fakeBridge', import: '@weft-js/agent/test', summary: 'A scripted bridge for tests' },
    ],
    map: [
      {
        want: 'Let the assistant do something',
        call: "`agent: { say: 'What it does' }` on the query or mutation",
        have: '`weft docs agent`',
      },
    ],
  }),
})

export default agent
