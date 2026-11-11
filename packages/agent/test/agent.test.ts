// The assistant on the real handler: tools from opted-in functions, a turn that calls them as the signed-in person,
// refusals the grant decides, a held call the owner approves, conversations kept and archived, tokens on the MCP
// endpoint, and the history the API bridge sends back.
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { allows } from '@weft-js/agent'
import { defineAgent, extension, memoryAgentStore, allTools } from '@weft-js/agent/server'
import { fakeBridge, type Line } from '@weft-js/agent/test'
import { toApi } from '@weft-js/agent/anthropic'
import { mutation, query, type Context } from '@weft-js/start'
import { createHandler } from '@weft-js/start/server'

// oxlint-disable-next-line typescript/no-explicit-any -- response bodies are read by shape, the way a page reads them
type Loose = any

// The shop: a menu anyone signed in reads, prices only the owner changes, a refund the owner approves, and a helper no
// agent may call directly (but a tool may, inside its own run).
const prices = new Map([['latte', 450]])
const refunds: string[] = []
const audit = mutation({
  $id: 'audit.000001',
  auth: 'user',
  input: z.object({ note: z.string() }),
  run: () => 'noted',
})
const menu = query({
  $id: 'menu.000001',
  auth: 'user',
  tags: ['menu'],
  agent: { say: 'The menu, with prices in cents' },
  run: () => Object.fromEntries(prices),
})
const setPrice = mutation({
  $id: 'setPrice.000001',
  auth: { role: 'owner' },
  input: z.object({ item: z.string(), cents: z.int().min(0) }),
  invalidates: ['menu'],
  agent: { say: 'Change a price' },
  run: async ({ input, ctx }) => {
    prices.set(input.item, input.cents)
    // a tool may call what agents can't reach: only the outermost call is checked
    const { serverCall } = await import('@weft-js/start')
    await serverCall(audit.$id, {
      note: `price by ${(ctx as unknown as { user: { id: string } }).user.id}`,
    })
    return prices.get(input.item)
  },
})
const refund = mutation({
  $id: 'refund.000001',
  auth: 'user',
  input: z.object({ order: z.string() }),
  agent: { scope: 'orders', confirm: true, say: 'Refund an order' },
  run: ({ input }) => {
    refunds.push(input.order)
    return 'refunded'
  },
})
void menu
void setPrice
void refund

const people = {
  owner: { id: 'u-owner', role: 'owner' },
  staff: { id: 'u-staff', role: 'staff' },
}

function app(
  script: Line[] = [],
  who: keyof typeof people = 'owner',
  roles: Record<string, string[]> = { owner: ['*'], staff: ['menu.read', 'orders.*'] },
) {
  const store = memoryAgentStore()
  const bridge = fakeBridge(script)
  const agent = defineAgent({
    store,
    bridges: [bridge],
    system: 'You run the shop.',
    roles,
    user: (id) => Object.values(people).find((p) => p.id === id) ?? null,
  })
  // the app's own functions, as `weft add agent` writes them
  mutation({ $id: 'start.000001', auth: 'user', run: ({ ctx }) => agent.start(ctx) })
  mutation({
    $id: 'send.000001',
    auth: 'user',
    input: z.object({ conversation: z.string(), text: z.string() }),
    run: ({ input, ctx }) => agent.send(ctx, input),
  })
  mutation({
    $id: 'resolve.000001',
    auth: 'user',
    input: z.object({ call: z.string(), approve: z.boolean() }),
    run: ({ input, ctx }) => agent.resolve(ctx, input),
  })
  let user: object | null = people[who]
  const handler = createHandler({
    manifest: { dir: '', routes: [], layouts: [] },
    modules: {},
    dev: true,
    context: () => ({ user }),
    extensions: [{ key: 'agent', load: () => Promise.resolve(extension(agent)) }],
  })
  const call = async (id: string, input: unknown = {}) => {
    const res = await handler(
      new Request(`http://localhost/_weft/fn/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-weft': '1' },
        body: JSON.stringify({ i: input }),
      }),
    )
    const body = (await res.json()) as { v?: unknown; e?: { code: string; message: string } }
    if (body.e) throw Object.assign(new Error(body.e.message), { code: body.e.code })
    return body.v as Loose
  }
  const mcp = async (token: string, method: string, params?: object) => {
    const res = await handler(
      new Request('http://localhost/_weft/x/agent/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    )
    return { status: res.status, body: res.status === 200 ? await res.json() : null }
  }
  return {
    agent,
    store,
    bridge,
    call,
    mcp,
    signOut: () => (user = null),
    ctx: () =>
      ({ user: people[who], request: new Request('http://localhost/') }) as unknown as Context,
  }
}

beforeEach(() => {
  prices.set('latte', 450)
  refunds.length = 0
})

test('grants: a scope, an action, wildcards, and write covering read', () => {
  expect(allows(['menu.read'], 'menu.read')).toBe(true)
  expect(allows(['menu.read'], 'menu.write')).toBe(false)
  expect(allows(['menu.write'], 'menu.read')).toBe(true)
  expect(allows(['menu'], 'menu.write')).toBe(true)
  expect(allows(['*.read'], 'orders.read')).toBe(true)
  expect(allows(['*.read'], 'orders.write')).toBe(false)
  expect(allows(['*'], 'anything.write')).toBe(true)
  expect(allows([], 'menu.read')).toBe(false)
})

test('only opted-in functions are tools, each with its permission and input schema', () => {
  const tools = Object.fromEntries(allTools().map((t) => [t.name, t]))
  expect(Object.keys(tools)).toEqual(expect.arrayContaining(['menu', 'setPrice', 'refund']))
  expect(tools.audit).toBeUndefined()
  expect(tools.menu).toMatchObject({ kind: 'query', permission: 'menu.read', confirm: false })
  expect(tools.setPrice).toMatchObject({ kind: 'mutation', permission: 'menu.write' })
  expect(tools.refund).toMatchObject({ permission: 'orders.write', confirm: true })
  expect(tools.setPrice!.input).toMatchObject({
    type: 'object',
    properties: { item: { type: 'string' }, cents: { type: 'integer' } },
  })
})

test('a turn: the agent reads, changes a price as the owner, and says so; usage is kept', async () => {
  const { call, store, bridge } = app([
    { call: { tool: 'menu' } },
    { call: { tool: 'setPrice', input: { item: 'latte', cents: 400 } } },
    'Latte is now $4.00.',
  ])
  const c = await call('start.000001')
  const reply = await call('send.000001', { conversation: c.id, text: 'lower latte to 4 bucks' })
  expect(prices.get('latte')).toBe(400)
  expect(reply.parts.filter((p: Loose) => p.type === 'result')).toEqual([
    expect.objectContaining({ tool: 'menu', status: 'ok', output: { latte: 450 } }),
    expect.objectContaining({ tool: 'setPrice', status: 'ok', output: 400 }),
  ])
  expect(reply.parts.at(-1)).toEqual({ type: 'text', text: 'Latte is now $4.00.' })
  // the bridge saw the results of the calls it made before it went on
  expect(bridge.turns[2]!.messages.at(-1)!.parts.some((p) => p.type === 'result')).toBe(true)
  const saved = await store.conversation(c.id)
  expect(saved!.title).toBe('lower latte to 4 bucks')
  expect((await store.usage('u-owner', 0)).length).toBe(3)
})

test("staff: the grant hides what they can't do, and refuses it if the agent asks anyway", async () => {
  const { call, agent, ctx } = app(
    [{ call: { tool: 'setPrice', input: { item: 'latte', cents: 1 } } }, 'Done?'],
    'staff',
  )
  expect(agent.tools(ctx()).map((t) => t.name)).toEqual(['menu', 'refund'])
  const c = await call('start.000001')
  const reply = await call('send.000001', { conversation: c.id, text: 'make lattes free' })
  expect(prices.get('latte')).toBe(450)
  expect(reply.parts.find((p: Loose) => p.type === 'result')).toMatchObject({ status: 'refused' })
})

test("a person's auth still holds under a grant: owner-only stays owner-only", async () => {
  const everything = { owner: ['*'], staff: ['*'] }
  const { call, agent, ctx } = app(
    [{ call: { tool: 'setPrice', input: { item: 'latte', cents: 1 } } }, 'ok'],
    'staff',
    everything,
  )
  expect(agent.tools(ctx()).map((t) => t.name)).toContain('setPrice')
  const c = await call('start.000001')
  const reply = await call('send.000001', { conversation: c.id, text: 'free lattes' })
  expect(prices.get('latte')).toBe(450)
  expect(reply.parts.find((p: Loose) => p.type === 'result')).toMatchObject({ status: 'error' })
})

test('a confirm tool waits for the owner; approving runs it and the agent goes on', async () => {
  const { call, store } = app([
    { call: { tool: 'refund', input: { order: 'A12' } } },
    'Refunded A12.',
  ])
  const c = await call('start.000001')
  const first = await call('send.000001', { conversation: c.id, text: 'refund A12' })
  expect(first.parts.find((p: Loose) => p.type === 'result').status).toBe('waiting')
  expect(refunds).toEqual([])
  const [held] = await store.pending(c.id)
  const after = await call('resolve.000001', { call: held!.id, approve: true })
  expect(refunds).toEqual(['A12'])
  expect(after.parts.at(-1)).toEqual({ type: 'text', text: 'Refunded A12.' })
  await expect(call('resolve.000001', { call: held!.id, approve: true })).rejects.toThrow(
    'already answered',
  )
})

test('declining runs nothing', async () => {
  const { call, store } = app([
    { call: { tool: 'refund', input: { order: 'B7' } } },
    'Okay, no refund.',
  ])
  const c = await call('start.000001')
  await call('send.000001', { conversation: c.id, text: 'refund B7' })
  const [held] = await store.pending(c.id)
  await call('resolve.000001', { call: held!.id, approve: false })
  expect(refunds).toEqual([])
  const msgs = await store.messages(c.id)
  expect(
    msgs.flatMap((m) => m.parts).some((p) => p.type === 'result' && p.status === 'declined'),
  ).toBe(true)
})

test('conversations: rename, pin, archive, bring back, delete; only the owner sees them', async () => {
  const { agent, ctx } = app()
  const a = await agent.start(ctx(), { title: 'Prices' })
  const b = await agent.start(ctx())
  await agent.update(ctx(), b.id, { title: 'Hours', pinned: true })
  expect((await agent.conversations(ctx())).map((c) => c.title)).toEqual(['Hours', 'Prices'])
  await agent.update(ctx(), a.id, { state: 'archived' })
  expect((await agent.conversations(ctx())).map((c) => c.title)).toEqual(['Hours'])
  expect((await agent.conversations(ctx(), 'archived')).map((c) => c.title)).toEqual(['Prices'])
  await agent.remove(ctx(), a.id)
  expect(await agent.conversations(ctx(), 'archived')).toEqual([])
  const other = {
    user: people.staff,
    request: new Request('http://localhost/'),
  } as unknown as Context
  await expect(agent.conversation(other, b.id)).rejects.toThrow('No such conversation')
})

test('a token on the MCP endpoint: its tools, its calls, its limits, and revoking it', async () => {
  const { agent, ctx, mcp, store } = app()
  const { token, secret } = await agent.createToken(ctx(), {
    name: 'Claude Code',
    grants: ['menu.read', 'orders.write'],
  })
  expect(token.grants).toEqual(['menu.read', 'orders.write'])
  expect(
    (await mcp(secret, 'initialize', { protocolVersion: '2025-06-18' })).body.result.serverInfo
      .name,
  ).toBe('weft-agent')
  const list = await mcp(secret, 'tools/list')
  expect(list.body.result.tools.map((t: { name: string }) => t.name)).toEqual(['menu', 'refund'])
  const read = await mcp(secret, 'tools/call', { name: 'menu', arguments: {} })
  expect(JSON.parse(read.body.result.content[0].text)).toEqual({ latte: 450 })
  const write = await mcp(secret, 'tools/call', {
    name: 'setPrice',
    arguments: { item: 'latte', cents: 1 },
  })
  expect(write.body.result.isError).toBe(true)
  expect(prices.get('latte')).toBe(450)
  // a confirm tool can't be approved from outside
  const held = await mcp(secret, 'tools/call', { name: 'refund', arguments: { order: 'C3' } })
  expect(held.body.result.isError).toBe(true)
  expect(refunds).toEqual([])
  expect((await store.usage('u-owner', 0)).filter((u) => u.token === token.id).length).toBe(3)
  await agent.revokeToken(ctx(), token.id)
  expect((await mcp(secret, 'tools/list')).status).toBe(401)
  expect((await mcp('wa_nonsense', 'tools/list')).status).toBe(401)
})

test("a token can't grant more than its creator holds", async () => {
  const { agent, ctx } = app([], 'staff')
  const { token } = await agent.createToken(ctx(), {
    name: 't',
    grants: ['menu.read', 'menu.write', 'orders.write'],
  })
  expect(token.grants).toEqual(['menu.read', 'orders.write'])
  await expect(agent.createToken(ctx(), { name: 't', grants: ['menu.write'] })).rejects.toThrow(
    'at least one',
  )
})

test('signed out, nothing runs', async () => {
  const { call, signOut } = app(['hi'])
  const c = await call('start.000001')
  signOut()
  await expect(call('send.000001', { conversation: c.id, text: 'hi' })).rejects.toThrow()
})

test("the API bridge's history: a step's own content back, its results as tool_results, later answers as words", () => {
  const native = [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: 'Checking.' },
    { type: 'tool_use', id: 'tu1', name: 'menu', input: {} },
  ]
  const out = toApi([
    { id: '1', conversation: 'c', role: 'user', parts: [{ type: 'text', text: 'prices?' }], at: 1 },
    {
      id: '2',
      conversation: 'c',
      role: 'assistant',
      parts: [
        { type: 'native', bridge: 'claude', content: native },
        { type: 'text', text: 'Checking.' },
        { type: 'call', id: 'tu1', tool: 'menu', input: {} },
        { type: 'result', id: 'tu1', tool: 'menu', status: 'ok', output: { latte: 450 } },
      ],
      at: 2,
    },
    {
      id: '3',
      conversation: 'c',
      role: 'assistant',
      parts: [{ type: 'result', id: 'x', tool: 'refund', status: 'ok', output: 'refunded' }],
      at: 3,
    },
  ])
  expect(out).toEqual([
    { role: 'user', content: [{ type: 'text', text: 'prices?' }] },
    { role: 'assistant', content: native },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu1', content: '{"latte":450}', is_error: false },
        { type: 'text', text: '[refund → ok: refunded]' },
      ],
    },
  ])
})

test('a bridge that runs tools over MCP: its turn token works for this turn only, and its calls land in the reply', async () => {
  const box: { handle?: (r: Request) => Promise<Response> } = {}
  let token = ''
  const rpc = (body: object) =>
    box.handle!(
      new Request('http://localhost/_weft/x/agent/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
      }),
    )
  const bridge = fakeBridge(
    [
      async (turn) => {
        token = turn.mcp!.token
        expect(turn.mcp!.url).toBe('http://localhost/_weft/x/agent/mcp')
        await rpc({
          method: 'tools/call',
          params: { name: 'setPrice', arguments: { item: 'latte', cents: 380 } },
        })
        return 'Latte is $3.80 now.'
      },
    ],
    { tools: 'mcp' },
  )
  // a line may be async here: the fake awaits what the function gives back
  const store = memoryAgentStore()
  const agent = defineAgent({ store, bridges: [bridge], system: '' })
  mutation({ $id: 'mstart.000001', auth: 'user', run: ({ ctx }) => agent.start(ctx) })
  mutation({
    $id: 'msend.000001',
    auth: 'user',
    input: z.object({ conversation: z.string(), text: z.string() }),
    run: ({ input, ctx }) => agent.send(ctx, input),
  })
  const handler = createHandler({
    manifest: { dir: '', routes: [], layouts: [] },
    modules: {},
    dev: true,
    context: () => ({ user: people.owner }),
    extensions: [{ key: 'agent', load: () => Promise.resolve(extension(agent)) }],
  })
  box.handle = handler
  const post = async (id: string, i: unknown = {}): Promise<Loose> => {
    const res = await handler(
      new Request(`http://localhost/_weft/fn/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-weft': '1' },
        body: JSON.stringify({ i }),
      }),
    )
    const body: Loose = await res.json()
    return body.v
  }
  const c = await post('mstart.000001')
  const reply = await post('msend.000001', { conversation: c.id, text: 'latte 3.80' })
  expect(prices.get('latte')).toBe(380)
  expect(reply.parts.map((p: Loose) => p.type)).toEqual(['call', 'result', 'text'])
  // the turn is over: its token is too
  expect((await rpc({ method: 'tools/list' })).status).toBe(401)
})

/** The agent tables as `drizzle-kit generate` would write them for SQLite. */
const AGENT_SQL = [
  'create table agent_conversations (id text primary key, title text not null, owner text not null, state text not null, pinned integer not null, bridge text not null, created integer not null, updated integer not null)',
  'create table agent_messages (id text primary key, conversation text not null, role text not null, parts text not null, at integer not null)',
  'create table agent_usage (id text primary key, conversation text, token text, bridge text not null, model text not null, input integer not null, output integer not null, calls integer not null, ms integer not null, at integer not null)',
  'create table agent_pending (id text primary key, conversation text not null, tool text not null, input text not null, at integer not null)',
  'create table agent_tokens (id text primary key, name text not null, owner text not null, grants text not null, hash text not null unique, created integer not null, used integer, revoked integer not null)',
].join(';\n--> statement-breakpoint\n')

test('drizzleAgentStore keeps it all in SQLite', async () => {
  const { createDb } = await import('@weft-js/start/db/sqlite')
  const { drizzleAgentStore } = await import('@weft-js/agent/drizzle')
  const { setup } = await import('../src/setup.mjs')
  const files = setup.run({ engine: 'sqlite', layer: 'drizzle', read: () => '' }).files as Record<
    string,
    string
  >
  const src = files['src/db/agent.schema.ts']!
  // the scaffolded schema, imported as the app would import it
  const file = join(import.meta.dirname, `.agent-schema-${process.pid}.ts`)
  writeFileSync(file, src)
  const t = await import(file).finally(() => rmSync(file, { force: true }))
  const db = createDb({ schema: t, url: ':memory:', migrate: false })
  await db.$weft.migrate([{ tag: '0000_agent', sql: AGENT_SQL }])
  const store = drizzleAgentStore(db, {
    conversations: t.agentConversations,
    messages: t.agentMessages,
    usage: t.agentUsage,
    pending: t.agentPending,
    tokens: t.agentTokens,
  })
  const c = {
    id: 'c1',
    title: 'Hi',
    owner: 'u',
    state: 'open' as const,
    pinned: true,
    bridge: 'fake',
    created: 1,
    updated: 2,
  }
  await store.saveConversation(c)
  await store.saveConversation({ ...c, title: 'Renamed' })
  expect(await store.conversations('u', 'open')).toEqual([{ ...c, title: 'Renamed' }])
  await store.addMessage({
    id: 'm1',
    conversation: 'c1',
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
    at: 3,
  })
  expect((await store.messages('c1'))[0]!.parts).toEqual([{ type: 'text', text: 'hello' }])
  await store.addUsage({
    conversation: 'c1',
    token: null,
    bridge: 'fake',
    model: 'm',
    input: 5,
    output: 7,
    calls: 1,
    ms: 9,
    at: 10,
  })
  expect((await store.usage('u', 0))[0]).toMatchObject({ input: 5, output: 7 })
  await store.hold({ id: 'p1', conversation: 'c1', tool: 'refund', input: { order: 'A' }, at: 4 })
  expect((await store.take('p1'))!.input).toEqual({ order: 'A' })
  expect(await store.take('p1')).toBeNull()
  await store.saveToken({
    id: 't1',
    name: 'cc',
    owner: 'u',
    grants: ['menu.read'],
    hash: 'h',
    created: 5,
    used: null,
    revoked: false,
  })
  expect((await store.tokenByHash('h'))!.grants).toEqual(['menu.read'])
  expect((await store.tokens('u'))[0]).not.toHaveProperty('hash')
  await store.removeConversation('c1')
  expect(await store.messages('c1')).toEqual([])
  expect(db.$weft.exempt.has('agent_messages')).toBe(true)
})

test('a failed tool tells the agent why: a declared message, or each input issue', async () => {
  const { failure } = await import('../src/server/run')
  expect(failure({ data: { message: 'Step 2: no such item' } })).toBe('Step 2: no such item')
  expect(failure({ issues: [{ path: [{ key: 'cents' }], message: 'Too small' }] })).toBe(
    'Fix the input: cents: Too small',
  )
  expect(failure(new Error('boom'))).toBe('boom')
})
