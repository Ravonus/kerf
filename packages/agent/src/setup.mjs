// What `kerf add agent` writes, as data: `kerf add` does the writing, so a dry run and a refusal come for free. Plain
// JS strings, because this loads with the config.

/** The five tables `drizzleAgentStore` reads: times in ms, JSON in text, flags in integers. */
function tables(engine) {
  const cols = ({
    table,
    str,
    long,
    int,
    key,
  }) => `export const agentConversations = ${table}('agent_conversations', {
  id: ${key}.primaryKey(),
  title: ${str}.notNull(),
  owner: ${key}.notNull(),
  state: ${str}.notNull(),
  pinned: ${int}.notNull(),
  bridge: ${str}.notNull(),
  created: ${long}.notNull(),
  updated: ${long}.notNull(),
})

export const agentMessages = ${table}('agent_messages', {
  id: ${key}.primaryKey(),
  conversation: ${key}.notNull(),
  role: ${str}.notNull(),
  parts: text().notNull(),
  at: ${long}.notNull(),
})

export const agentUsage = ${table}('agent_usage', {
  id: ${key}.primaryKey(),
  conversation: ${key},
  token: ${key},
  bridge: ${str}.notNull(),
  model: ${str}.notNull(),
  input: ${int}.notNull(),
  output: ${int}.notNull(),
  calls: ${int}.notNull(),
  ms: ${int}.notNull(),
  at: ${long}.notNull(),
})

export const agentPending = ${table}('agent_pending', {
  id: ${key}.primaryKey(),
  conversation: ${key}.notNull(),
  tool: ${str}.notNull(),
  input: text().notNull(),
  at: ${long}.notNull(),
})

export const agentTokens = ${table}('agent_tokens', {
  id: ${key}.primaryKey(),
  name: ${str}.notNull(),
  owner: ${key}.notNull(),
  grants: text().notNull(),
  hash: ${key}.notNull().unique(),
  created: ${long}.notNull(),
  used: ${long},
  revoked: ${int}.notNull(),
})
`
  return {
    sqlite: () =>
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n\n${cols({ table: 'sqliteTable', str: 'text()', long: 'integer()', int: 'integer()', key: 'text()' })}`,
    postgres: () =>
      `import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core'\n\n${cols({ table: 'pgTable', str: 'text()', long: "bigint({ mode: 'number' })", int: 'integer()', key: 'text()' })}`,
    mysql: () =>
      `import { bigint, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core'\n\n${cols({ table: 'mysqlTable', str: 'varchar({ length: 191 })', long: "bigint({ mode: 'number' })", int: 'int()', key: 'varchar({ length: 191 })' })}`,
  }[engine]()
}

const server = (
  drizzle,
) => `${drizzle ? "import { drizzleAgentStore } from '@kerf/agent/drizzle'\n" : ''}import { anthropic } from '@kerf/agent/anthropic'
import { claudeCli } from '@kerf/agent/cli'
import { defineAgent${drizzle ? '' : ', memoryAgentStore'} } from '@kerf/agent/server'
${drizzle ? "import { db } from '#/db/index.server'\nimport { agentConversations, agentMessages, agentPending, agentTokens, agentUsage } from '#/db/schema'\n" : ''}
// The app's assistant. A query or mutation becomes one of its tools by saying so: \`agent: { say: '…' }\` beside
// \`auth\`. Each runs as the person asking, through their own \`auth\`, and only if the grant below allows it.
// Outside agents (Claude Code, Codex) connect to /_kerf/x/agent/mcp with a token made in the app.
export default defineAgent({
  store: ${drizzle ? 'drizzleAgentStore(db, { conversations: agentConversations, messages: agentMessages, usage: agentUsage, pending: agentPending, tokens: agentTokens })' : 'memoryAgentStore()'},
  // first available answers by default: the API with ANTHROPIC_API_KEY set, else the \`claude\` CLI on this machine
  bridges: [anthropic(), claudeCli()],
  system: 'You run this site for its owner. Use the tools to look things up and make changes; say what you changed.',
  // roles: { admin: ['*'], staff: ['orders.*', 'menu.read'] },
  // user: (id) => …, // the user a token acts as: needed before tokens work
})
`

const functions = `import { mutation, query, stream, topic } from '@kerf/start'
import type { TurnEvent } from '@kerf/agent'
import { z } from 'zod'
import agent from '../agent.server'

const Event = z.custom<TurnEvent>((v) => !!v && typeof v === 'object' && 'type' in v)
const turns = topic('agent-turn', { key: z.string().max(64), message: Event })
const Id = z.string().min(1).max(64)

/** Conversations, newest first: \`open\` or \`archived\`. */
export const conversations = query({
  auth: 'user',
  input: z.object({ state: z.enum(['open', 'archived']).default('open') }),
  tags: ['agent'],
  run: ({ input, ctx }) => agent.conversations(ctx, input.state),
})

/** One conversation: its messages and the calls waiting on the owner. */
export const conversation = query({
  auth: 'user',
  input: z.object({ id: Id }),
  tags: ['agent'],
  run: ({ input, ctx }) => agent.conversation(ctx, input.id),
})

/** Who can answer, what this person may let it do, and every tool and scope: the settings page. */
export const agentInfo = query({
  auth: 'user',
  tags: ['agent'],
  run: ({ ctx }) => ({ bridges: agent.bridges(), grants: agent.grants(ctx), tools: agent.tools(ctx), scopes: agent.scopes() }),
})

export const startConversation = mutation({
  auth: 'user',
  input: z.object({ title: z.string().max(120).optional(), bridge: z.string().max(40).optional() }),
  invalidates: ['agent'],
  run: ({ input, ctx }) => agent.start(ctx, input),
})

/** Rename, archive or bring back, pin, or switch who answers. */
export const updateConversation = mutation({
  auth: 'user',
  input: z.object({
    id: Id,
    title: z.string().max(120).optional(),
    state: z.enum(['open', 'archived']).optional(),
    pinned: z.boolean().optional(),
    bridge: z.string().max(40).optional(),
  }),
  invalidates: ['agent'],
  run: ({ input: { id, ...change }, ctx }) => agent.update(ctx, id, change),
})

export const deleteConversation = mutation({
  auth: 'user',
  input: z.object({ id: Id }),
  invalidates: ['agent'],
  run: ({ input, ctx }) => agent.remove(ctx, input.id),
})

/** Say something. The reply streams on \`turn({ conversation })\` while this runs. */
export const send = mutation({
  auth: 'user',
  input: z.object({ conversation: Id, text: z.string().trim().min(1).max(8000) }),
  invalidates: ['agent'],
  run: ({ input, ctx }) => agent.send(ctx, input, (e) => void turns.publish(input.conversation, e).catch(() => {})),
})

/** Approve or decline a call the agent is waiting on; it goes on from there. */
export const resolveCall = mutation({
  auth: 'user',
  input: z.object({ conversation: Id, call: z.string().min(1).max(200), approve: z.boolean() }),
  invalidates: ['agent'],
  run: ({ input, ctx }) =>
    agent.resolve(ctx, input, (e) => void turns.publish(input.conversation, e).catch(() => {})),
})

/** A conversation's reply as it's written. */
export const turn = stream({
  auth: 'user',
  input: z.object({ conversation: Id }),
  message: Event,
  async *run({ input, ctx, signal }) {
    await agent.conversation(ctx, input.conversation) // only its owner listens
    for await (const m of turns.subscribe(input.conversation, { signal })) yield m
  },
})

export const usage = query({
  auth: 'user',
  input: z.object({ days: z.int().min(1).max(366).default(30) }),
  tags: ['agent'],
  run: ({ input, ctx }) => agent.usage(ctx, input.days),
})

export const tokens = query({ auth: 'user', tags: ['agent'], run: ({ ctx }) => agent.tokens(ctx) })

/** A token for Claude Code, Codex or a script. The secret comes back once: show it, never store it. */
export const createToken = mutation({
  auth: 'user',
  input: z.object({ name: z.string().max(80), grants: z.array(z.string().max(80)).min(1).max(50) }),
  invalidates: ['agent'],
  run: ({ input, ctx }) => agent.createToken(ctx, input),
})

export const revokeToken = mutation({
  auth: 'user',
  input: z.object({ id: Id }),
  invalidates: ['agent'],
  run: ({ input, ctx }) => agent.revokeToken(ctx, input.id),
})
`

export const setup = {
  with: [],
  needs: ['auth'],
  run({ engine, layer, read }) {
    const drizzle = layer === 'drizzle'
    return {
      files: {
        'src/agent.server.ts': server(drizzle),
        'src/server/agent.ts': functions,
        ...(drizzle && { 'src/db/agent.schema.ts': tables(engine) }),
      },
      edits: {
        ...(drizzle && {
          'src/db/schema.ts': `${read('src/db/schema.ts').trimEnd()}\n\nexport * from './agent.schema'\n`,
        }),
      },
      env: {},
      next: [
        ...(drizzle
          ? ['`kerf db generate`, then reload: the migration applies on the next request']
          : []),
        "offer a function to the assistant: `agent: { say: 'What it does' }` beside `auth`, and `confirm: true` on one the owner should approve each time",
        'set ANTHROPIC_API_KEY, or sign in to the `claude` CLI on this machine',
        'for tokens, give `defineAgent` a `user: (id) => …` that loads the user a token acts as',
      ],
    }
  },
}
