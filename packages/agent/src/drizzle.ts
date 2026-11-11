// An `AgentStore` on the app's own Drizzle tables (`weft add agent` writes them to `src/db/agent.schema.ts`), on
// Postgres, SQLite or MySQL. JSON goes in text columns and flags in integers, so one store reads all three.
import {
  and,
  desc,
  eq,
  getTableName,
  gte,
  inArray,
  or,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import type { DbHandle } from '@weft-js/start/db/core'
import type { AgentToken, Conversation, Message, PendingCall, Usage } from './index'
import type { AgentStore, TokenRow } from './store'

type Row = Record<string, unknown>
type Query = Promise<Row[]> & {
  limit(n: number): Promise<Row[]>
  orderBy(...c: SQL[]): Promise<Row[]>
}
interface Client {
  select(fields?: Record<string, AnyColumn>): {
    from(table: Table): { where(on: SQL | undefined): Query }
  }
  insert(table: Table): {
    values(row: object): Promise<unknown> & {
      onDuplicateKeyUpdate(update: { set: object }): Promise<unknown>
      onConflictDoUpdate(update: { target: AnyColumn; set: object }): Promise<unknown>
    }
  }
  delete(table: Table): { where(on: SQL | undefined): Promise<unknown> }
}

type T<C extends string> = Table & Record<C, AnyColumn>

/** The five agent tables from `src/db/agent.schema.ts`. */
export interface AgentTables {
  conversations: T<'id' | 'owner' | 'state' | 'pinned' | 'updated'>
  messages: T<'id' | 'conversation' | 'at'>
  usage: T<'id' | 'conversation' | 'token' | 'at'>
  pending: T<'id' | 'conversation'>
  tokens: T<'id' | 'owner' | 'hash' | 'created'>
}

const parse = <V>(s: unknown, fallback: V): V => {
  try {
    return typeof s === 'string' ? (JSON.parse(s) as V) : fallback
  } catch {
    return fallback
  }
}

const conversationOf = (r: Row): Conversation => ({
  id: String(r.id),
  title: String(r.title),
  owner: String(r.owner),
  state: r.state === 'archived' ? 'archived' : 'open',
  pinned: !!Number(r.pinned),
  bridge: String(r.bridge),
  created: Number(r.created),
  updated: Number(r.updated),
})
const tokenOf = (r: Row): TokenRow => ({
  id: String(r.id),
  name: String(r.name),
  owner: String(r.owner),
  grants: parse<string[]>(r.grants, []),
  hash: String(r.hash),
  created: Number(r.created),
  used: r.used == null ? null : Number(r.used),
  revoked: !!Number(r.revoked),
})

const pendingOf = (r: Row): PendingCall => ({
  id: String(r.id),
  conversation: String(r.conversation),
  tool: String(r.tool),
  input: parse(r.input, {}),
  at: Number(r.at),
})

type Upsert = (table: Table & { id: AnyColumn }, row: Row) => Promise<void>

/** Conversations and their messages. */
function conversationRows(
  client: Client,
  upsert: Upsert,
  { conversations, messages, pending }: AgentTables,
) {
  return {
    async conversations(owner, state) {
      const rows = await client
        .select()
        .from(conversations)
        .where(and(eq(conversations.owner, owner), eq(conversations.state, state)))
        .orderBy(desc(conversations.pinned), desc(conversations.updated))
      return rows.map(conversationOf)
    },
    async conversation(id) {
      const [r] = await client.select().from(conversations).where(eq(conversations.id, id)).limit(1)
      return r ? conversationOf(r) : null
    },
    saveConversation: (c) => upsert(conversations, { ...c, pinned: c.pinned ? 1 : 0 }),
    async removeConversation(id) {
      await client.delete(messages).where(eq(messages.conversation, id))
      await client.delete(pending).where(eq(pending.conversation, id))
      await client.delete(conversations).where(eq(conversations.id, id))
    },
    async messages(conversation) {
      const rows = await client
        .select()
        .from(messages)
        .where(eq(messages.conversation, conversation))
        .orderBy(messages.at as unknown as SQL)
      return rows.map((r): Message => ({
        id: String(r.id),
        conversation: String(r.conversation),
        role: r.role === 'assistant' ? 'assistant' : 'user',
        parts: parse(r.parts, []),
        at: Number(r.at),
      }))
    },
    addMessage: (m) => upsert(messages, { ...m, parts: JSON.stringify(m.parts) }),
  } satisfies Partial<AgentStore>
}

/** Usage rows, read back for one owner's conversations and tokens. */
function usageRows(client: Client, upsert: Upsert, { conversations, usage, tokens }: AgentTables) {
  return {
    addUsage: (u) => upsert(usage, { id: crypto.randomUUID(), ...u }),
    async usage(owner, since) {
      const mine = (
        await client
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.owner, owner))
      ).map((r) => String(r.id))
      const theirs = (
        await client.select({ id: tokens.id }).from(tokens).where(eq(tokens.owner, owner))
      ).map((r) => String(r.id))
      if (!mine.length && !theirs.length) return []
      const rows = await client
        .select()
        .from(usage)
        .where(
          and(
            gte(usage.at, since),
            or(
              mine.length ? inArray(usage.conversation, mine) : undefined,
              theirs.length ? inArray(usage.token, theirs) : undefined,
            ),
          ),
        )
      return rows.map((r): Usage => ({
        conversation: typeof r.conversation === 'string' ? r.conversation : null,
        token: typeof r.token === 'string' ? r.token : null,
        bridge: String(r.bridge),
        model: String(r.model),
        input: Number(r.input),
        output: Number(r.output),
        calls: Number(r.calls),
        ms: Number(r.ms),
        at: Number(r.at),
      }))
    },
  } satisfies Partial<AgentStore>
}

/** Held calls and tokens. */
function heldAndTokens(client: Client, upsert: Upsert, { pending, tokens }: AgentTables) {
  return {
    async pending(conversation) {
      const rows = await client.select().from(pending).where(eq(pending.conversation, conversation))
      return rows.map(pendingOf)
    },
    hold: (p) => upsert(pending, { ...p, input: JSON.stringify(p.input ?? {}) }),
    async take(id) {
      const [r] = await client.select().from(pending).where(eq(pending.id, id)).limit(1)
      if (!r) return null
      await client.delete(pending).where(eq(pending.id, id))
      return pendingOf(r)
    },
    async tokens(owner) {
      const rows = await client
        .select()
        .from(tokens)
        .where(eq(tokens.owner, owner))
        .orderBy(desc(tokens.created))
      return rows.map((r): AgentToken => {
        const { hash: _, ...t } = tokenOf(r)
        return t
      })
    },
    async token(id) {
      const [r] = await client.select().from(tokens).where(eq(tokens.id, id)).limit(1)
      return r ? tokenOf(r) : null
    },
    async tokenByHash(hash) {
      const [r] = await client.select().from(tokens).where(eq(tokens.hash, hash)).limit(1)
      return r ? tokenOf(r) : null
    },
    saveToken: (t) =>
      upsert(tokens, { ...t, grants: JSON.stringify(t.grants), revoked: t.revoked ? 1 : 0 }),
  } satisfies Partial<AgentStore>
}

/** An `AgentStore` on the app's Drizzle database and the tables `weft add agent` wrote. */
export function drizzleAgentStore(db: { $weft: DbHandle }, tables: AgentTables): AgentStore {
  const client = db as unknown as Client
  const mysql = db.$weft.dialect === 'mysql'
  // written by turns and by the MCP endpoint, outside any one function: the app's queries tag them `agent`
  for (const t of Object.values(tables)) db.$weft.exempt.add(getTableName(t))
  const upsert: Upsert = async (table, row) => {
    const { id: _, ...set } = row
    const insert = client.insert(table).values(row)
    await (mysql
      ? insert.onDuplicateKeyUpdate({ set })
      : insert.onConflictDoUpdate({ target: table.id, set }))
  }
  return {
    ...conversationRows(client, upsert, tables),
    ...usageRows(client, upsert, tables),
    ...heldAndTokens(client, upsert, tables),
  }
}
