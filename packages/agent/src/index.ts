// @kerf-js/agent, the part both sides share: what a function says to agents, how grants read, and the shapes of a
// conversation. The server half is `@kerf-js/agent/server`; nothing here touches a model, a key or the database.

/**
 * What a server function offers an agent, on `agent:` beside `auth`. A function without it is invisible to every
 * agent, whatever the grant: access is opted into, one function at a time.
 *
 * - `scope`: the permission's first half, `menu` in `menu.write`. Default: the function's first tag (a query) or
 *   first invalidated tag (a mutation), else its export name.
 * - `confirm`: the owner approves each call before it runs. A mutation that costs money or can't be undone wants it.
 * - `say`: what it does, for the model. Default: the export name in words.
 */
export interface AgentAccess {
  scope?: string
  confirm?: boolean
  say?: string
}

declare module '@kerf-js/start' {
  interface FnOptions {
    /** Offer this function to agents as a tool: `true`, or what it needs (`@kerf-js/agent`). */
    agent?: boolean | AgentAccess
  }
  interface Context {
    /** Set when an agent is the caller: who it acts for, and what it may do. Absent for a person. */
    agent?: AgentCaller
  }
}

/** An agent calling, as `ctx.agent` reads. */
export interface AgentCaller {
  /** The conversation, or the token, it's acting through. */
  via: { kind: 'conversation' | 'token'; id: string }
  /** What it may call: `menu.read`, `menu.*`, `*.read`, `*`. */
  grants: readonly string[]
}

/**
 * Whether `grants` allow `permission` (`menu.write`). A grant is `scope.action` where either half may be `*`; a bare
 * `scope` means `scope.*`. `write` covers `read`: what may change something may look at it.
 */
export function allows(grants: readonly string[], permission: string): boolean {
  const [scope = '', action = ''] = permission.split('.')
  return grants.some((g) => {
    const [gs = '', ga = '*'] = g.split('.')
    const scopeOk = gs === '*' || gs === scope
    const actionOk = ga === '*' || ga === action || (ga === 'write' && action === 'read')
    return scopeOk && actionOk
  })
}

/** One tool as a model sees it. */
export interface ToolInfo {
  /** The model's name for it: the export name, `[a-zA-Z0-9_-]`. */
  name: string
  /** The server function's `$id`. */
  id: string
  kind: 'query' | 'mutation'
  /** `scope.read` for a query, `scope.write` for a mutation. */
  permission: string
  confirm: boolean
  description: string
  /** JSON Schema of the input. */
  input: Record<string, unknown>
}

/** A conversation's line, as the list shows it. */
export interface Conversation {
  id: string
  title: string
  /** Who started it: the user's id. */
  owner: string
  state: 'open' | 'archived'
  pinned: boolean
  /** The bridge that answers it: `claude`, `cli`, `rust`… */
  bridge: string
  created: number
  updated: number
}

/** One part of a message: what was said, a tool the agent called, or what came back. */
export type Part =
  | { type: 'text'; text: string }
  | { type: 'call'; id: string; tool: string; input: unknown }
  | {
      type: 'result'
      id: string
      tool: string
      /** `ok` ran, `error` threw, `refused` the grant didn't allow it, `waiting` for the owner, `declined` by them. */
      status: 'ok' | 'error' | 'refused' | 'waiting' | 'declined'
      output: unknown
    }
  /**
   * A bridge's own record of a step, sent back to it unchanged (the API's thinking blocks are tied to the
   * conversation). Pages skip it.
   */
  | { type: 'native'; bridge: string; content: unknown }

/** One message in a conversation: what someone said, or what the agent wrote and called. */
export interface Message {
  id: string
  conversation: string
  role: 'user' | 'assistant'
  parts: Part[]
  at: number
}

/** What one turn cost. */
export interface Usage {
  conversation: string | null
  /** Set for a call through an API token rather than the app's own chat. */
  token: string | null
  bridge: string
  model: string
  input: number
  output: number
  /** Tool calls made in the turn. */
  calls: number
  ms: number
  at: number
}

/** A call held for the owner: a tool with `confirm`, waiting on Approve or Decline. */
export interface PendingCall {
  id: string
  conversation: string
  tool: string
  input: unknown
  at: number
}

/** An API token for an agent outside the app (Claude Code, Codex, a script): its grants, never its secret. */
export interface AgentToken {
  id: string
  name: string
  owner: string
  grants: string[]
  created: number
  used: number | null
  revoked: boolean
}

/** What streams to the page while a turn runs. Each message carries only what's new. */
export type TurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'call'; id: string; tool: string; input: unknown }
  | {
      type: 'result'
      id: string
      tool: string
      status: Extract<Part, { type: 'result' }>['status']
    }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string }
