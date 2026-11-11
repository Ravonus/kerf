// The server half. `src/agent.server.ts` default-exports `defineAgent({ … })`: that turns the extension on, and
// `src/server/agent.ts` (which `weft add agent` writes) wraps its methods as the app's own queries and mutations, so the
// pages get caching, invalidation and live updates like any other data.
import type { Context } from '@weft-js/start'
import type { ServerExtension } from '@weft-js/start/extension'
import { scopes, toolsFor } from './tools'
import { conversationApi, turnApi } from './server/conversations'
import { makeCore, userOf, type AgentOptions } from './server/core'
import { agentExtension } from './server/extension'
import { tokenApi } from './server/tokens'

export type { Bridge, BridgeStep, BridgeTurn } from './bridge'
export { transcript } from './bridge'
export { memoryAgentStore, type AgentStore, type TokenRow } from './store'
export { allTools, scopes, toolsFor } from './tools'
export { AgentError, agentCaller, type AgentOptions } from './server/core'

/** The app's assistant: conversations, turns, tokens and usage, as methods `src/server/agent.ts` wraps, plus the extension. */
export function defineAgent(options: AgentOptions) {
  const core = makeCore(options)
  return {
    options,
    /** What this person may let the agent do. */
    grants: (ctx: Context) => core.grantsOf(userOf(ctx)),
    /** The tools this person's agent can see. */
    tools: (ctx: Context) => toolsFor(core.grantsOf(userOf(ctx))),
    /** Every scope a tool names: the grants editor's rows. */
    scopes,
    /** The bridges that can answer here, for the picker. */
    bridges: () => core.usable().map((b) => ({ id: b.id, label: b.label })),
    ...conversationApi(core),
    ...turnApi(core),
    ...tokenApi(core),
    extension: agentExtension(core),
  }
}

/** What `defineAgent` returns. */
export type Agent = ReturnType<typeof defineAgent>

/** The `server.extension@1` provider: `src/agent.server.ts` default-exports `defineAgent(...)`. */
export const extension = (app: Agent): ServerExtension => app.extension

/** The extension's key: its routes live under `/_weft/x/agent/`. */
export const key = 'agent'
