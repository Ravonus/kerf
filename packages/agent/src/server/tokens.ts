// Tokens for agents outside the app, and what a person's agent has spent. A token never grants more than its creator
// holds, then or now.
import { randomBytes, randomUUID } from 'node:crypto'
import type { Context } from '@kerf-js/start'
import { allows, type AgentCaller, type AgentToken, type Usage } from '../index'
import { AgentError, MCP, hash, turnTokens, userOf, type Core, type User } from './core'

/** The grants of `wanted` that `held` covers. */
const within = (held: string[], wanted: string[]) =>
  wanted.filter(
    (g) =>
      held.includes('*') ||
      held.includes(g) ||
      (!g.includes('*') && allows(held, g.includes('.') ? g : `${g}.write`)),
  )

type Total = {
  bridge: string
  model: string
  input: number
  output: number
  calls: number
  turns: number
}

/** Rows summed by bridge and model. */
function totals(rows: Usage[]): Total[] {
  const by = new Map<string, Total>()
  for (const r of rows) {
    const k = `${r.bridge}:${r.model}`
    const t = by.get(k) ?? {
      bridge: r.bridge,
      model: r.model,
      input: 0,
      output: 0,
      calls: 0,
      turns: 0,
    }
    t.input += r.input
    t.output += r.output
    t.calls += r.calls
    t.turns++
    by.set(k, t)
  }
  return [...by.values()]
}

/** The usage and token methods of a `defineAgent` result. */
export function tokenApi(core: Core) {
  const { store } = core
  return {
    /** Usage since `days` ago: rows, and totals by bridge and model. */
    async usage(ctx: Context, days = 30) {
      const rows = await store.usage(userOf(ctx).id, Date.now() - days * 86_400_000)
      return { rows, totals: totals(rows) }
    },

    tokens: (ctx: Context) => store.tokens(userOf(ctx).id),

    /**
     * A token for an agent outside the app. Its grants can't exceed the creator's. The secret is returned this once:
     * give it to Claude Code, Codex or a script as `Authorization: Bearer <secret>` on `/_kerf/x/agent/mcp`.
     */
    async createToken(ctx: Context, input: { name: string; grants: string[] }) {
      const u = userOf(ctx)
      const grants = within(core.grantsOf(u), input.grants)
      if (!grants.length)
        throw new AgentError(
          'AGENT006',
          'Give the token at least one thing you can do yourself',
          422,
        )
      const secret = `wa_${randomBytes(32).toString('base64url')}`
      const token: AgentToken = {
        id: randomUUID(),
        name: input.name.trim() || 'Token',
        owner: u.id,
        grants,
        created: Date.now(),
        used: null,
        revoked: false,
      }
      await store.saveToken({ ...token, hash: hash(secret) })
      return { token, secret }
    },

    async revokeToken(ctx: Context, id: string) {
      const row = await store.token(id)
      if (!row || row.owner !== userOf(ctx).id)
        throw new AgentError('AGENT002', 'No such token', 404)
      await store.saveToken({ ...row, revoked: true })
    },
  }
}

/** The caller behind a bearer token on the MCP endpoint: a turn's, or an API token's. */
export async function bearer(core: Core, ctx: Context): Promise<object> {
  const secret = /^Bearer\s+(\S+)$/i.exec(ctx.request.headers.get('authorization') ?? '')?.[1]
  if (!secret) return {}
  if (!new URL(ctx.request.url).pathname.startsWith(MCP)) {
    // an agent's token anywhere else would be ignored and the call made as nobody: say where it goes instead
    if (/^w[at]_/.test(secret)) throw new AgentError('AGENT007', `Agents call tools through ${MCP}`)
    return {}
  }
  const t = turnTokens.get(secret)
  if (t && t.expires > Date.now())
    return {
      user: t.user,
      agent: { via: { kind: 'conversation', id: t.conversation }, grants: t.grants },
    }
  const row = await core.store.tokenByHash(hash(secret))
  if (!row || row.revoked || !core.options.user) return { user: null }
  const user = await core.options.user(row.owner, ctx)
  if (!user) return { user: null }
  void core.store.saveToken({ ...row, used: Date.now() })
  // never more than the owner can grant now: a demoted owner's old token shrinks with them
  const grants = within(core.grantsOf(user as User), row.grants)
  return { user, agent: { via: { kind: 'token', id: row.id }, grants } satisfies AgentCaller }
}
