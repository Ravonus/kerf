// What every part of the server half shares: the options, who's asking, what they may grant, and the state a turn
// keeps outside the store (its token and its reply in progress, for a bridge that calls tools over MCP).
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { Context } from '@weft-js/start'
import type { Bridge } from '../bridge'
import type { AgentCaller, Message, TurnEvent } from '../index'
import type { AgentStore } from '../store'

export type User = { id: string; role?: string | string[] | null }

/** How the app's assistant is set up: `src/agent.server.ts` passes these to `defineAgent`. */
export interface AgentOptions {
  store: AgentStore
  /** Who answers, by id. The first available one is the default. */
  bridges: Bridge[]
  /** What the agent is told before each conversation: the shop, the rules, the tone. */
  system: string | ((ctx: Context) => string | Promise<string>)
  /**
   * What each role may let an agent do: `{ owner: ['*'], staff: ['orders.*', 'menu.read'] }`. Roles are read from
   * `user.role` like `auth: { role }` reads them. Without it, any signed-in user grants `*`: their own `auth` still holds.
   */
  roles?: Record<string, string[]>
  /** The user a token acts as, by id: needed for tokens. Return null for one that's gone. */
  user?: (id: string, ctx: Context) => Promise<object | null> | object | null
  /** Most tool rounds in one turn. Default 8. */
  steps?: number
}

/** A refusal the client sees as it is: `answer` carries the code, message and status. */
export class AgentError extends Error {
  answer: { code: string; message: string; status: number }
  constructor(code: string, message: string, status = 403) {
    super(message)
    this.answer = { code, message, status }
  }
}

export const MCP = '/_weft/x/agent/mcp'

/** A tool call in progress: whose grants it runs under. Only the outermost call is checked; what it calls in turn is its own business. */
export const acting = new AsyncLocalStorage<{ caller: AgentCaller; checked: boolean }>()

/** Turn tokens: one per MCP turn, good for that conversation's grants until the turn ends. Process memory only. */
export const turnTokens = new Map<
  string,
  { conversation: string; user: object; grants: string[]; expires: number }
>()

/** An MCP turn in progress, so its tool calls land in the reply being written. */
export const liveTurns = new Map<string, { reply: Message; emit: (e: TurnEvent) => void }>()

export const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')

const rolesOf = (u: User | null | undefined) =>
  !u?.role
    ? []
    : Array.isArray(u.role)
      ? u.role
      : String(u.role)
          .split(',')
          .map((r) => r.trim())

export function userOf(ctx: Context): User {
  const u = (ctx as { user?: User | null }).user
  if (!u) throw new AgentError('AGENT001', 'Sign in to use the assistant', 401)
  return u
}

export type Core = ReturnType<typeof makeCore>

export function makeCore(options: AgentOptions) {
  const { store } = options
  const grantsOf = (u: User): string[] =>
    options.roles ? [...new Set(rolesOf(u).flatMap((r) => options.roles![r] ?? []))] : ['*']
  return {
    options,
    store,
    steps: options.steps ?? 8,
    grantsOf,
    usable: () => options.bridges.filter((b) => b.available?.() ?? true),
    bridge(id?: string) {
      const usable = options.bridges.filter((b) => b.available?.() ?? true)
      return usable.find((b) => b.id === id) ?? usable[0]
    },
    async mine(ctx: Context, id: string) {
      const c = await store.conversation(id)
      if (!c || c.owner !== userOf(ctx).id)
        throw new AgentError('AGENT002', 'No such conversation', 404)
      return c
    },
  }
}

/** The agent calling right now, if any: inside a tool, `ctx.agent` for the request may be a person's. */
export const agentCaller = () => acting.getStore()?.caller
