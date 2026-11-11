// The Rust bridge from the daemon's side: it long-polls the app's queue, runs the prompt, and posts the answer back.
import { afterEach, expect, test } from 'vitest'
import { z } from 'zod'
import { defineAgent, extension, memoryAgentStore } from '@weft-js/agent/server'
import { promptFor, readAnswer, rustBridge } from '@weft-js/agent/rust'
import { fakeBridge } from '@weft-js/agent/test'
import { mutation, query } from '@weft-js/start'
import { createHandler } from '@weft-js/start/server'

const TOKEN = 'b'.repeat(64)
const JOBS = 'http://localhost/_weft/x/agent/bridges/rust/jobs'

query({
  $id: 'latte.000001',
  auth: 'user',
  agent: { say: 'The latte price in cents' },
  run: () => 450,
})

function app(bridges = [rustBridge({ token: TOKEN })]) {
  const agent = defineAgent({ store: memoryAgentStore(), bridges, system: 'You run the shop.' })
  mutation({
    $id: 'start.000002',
    auth: 'user',
    run: ({ ctx }) => agent.start(ctx),
  })
  mutation({
    $id: 'send.000002',
    auth: 'user',
    input: z.object({ conversation: z.string(), text: z.string() }),
    run: ({ input, ctx }) => agent.send(ctx, input),
  })
  const handler = createHandler({
    manifest: { dir: '', routes: [], layouts: [] },
    modules: {},
    dev: true,
    context: () => ({ user: { id: 'u-owner' } }),
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
    const body = (await res.json()) as { v?: unknown; e?: { message: string } }
    if (body.e) throw new Error(body.e.message)
    return body.v as { id: string; bridge: string; parts: { type: string }[] }
  }
  const auth = { authorization: `Bearer ${TOKEN}` }
  const poll = (wait = 1) => handler(new Request(`${JOBS}?wait=${wait}`, { headers: auth }))
  const answer = (id: string, body: object) =>
    handler(
      new Request(`${JOBS}/${id}/result`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
  return { agent, handler, call, poll, answer }
}

afterEach(() => {
  delete process.env.AGENT_BRIDGE
})

test('the daemon needs the token, and the bridge is offered only while it polls', async () => {
  const { handler, poll, agent } = app()
  expect((await handler(new Request(`${JOBS}?wait=0`))).status).toBe(401)
  const wrong = { authorization: `Bearer ${'x'.repeat(64)}` }
  expect((await handler(new Request(`${JOBS}?wait=0`, { headers: wrong }))).status).toBe(401)
  expect((await poll(0)).status).toBe(204)
  expect(agent.bridges().map((b) => b.id)).toEqual(['rust'])
})

test('a turn through the daemon: a job, a tool call, its result in the next job, and the tokens it spent', async () => {
  const { call, poll, answer } = app()
  await poll(0)
  const c = await call('start.000002')
  expect(c.bridge).toBe('rust')
  const sent = call('send.000002', { conversation: c.id, text: 'what is a latte?' })

  const first = (await (await poll()).json()) as { job: Record<string, string> }
  expect(first.job).toMatchObject({ modelId: 'claude', principal: 'u-owner' })
  expect(first.job.prompt).toContain('- latte: The latte price in cents')
  expect(first.job.prompt).toContain('Owner: what is a latte?')
  await answer(first.job.id!, { text: '{"say": "", "calls": [{"tool": "latte", "input": {}}]}' })

  const second = (await (await poll()).json()) as { job: Record<string, string> }
  expect(second.job.prompt).toContain('[latte → ok: 450]')
  const done = await answer(second.job.id!, {
    text: 'Here you go:\n```json\n{"say": "A latte is $4.50.", "calls": []}\n```',
    tokens: { input: 900, output: 20, backend: 'claude' },
  })
  expect(await done.json()).toEqual({ ok: true, accepted: true })

  const reply = await sent
  expect(reply.parts).toEqual([
    expect.objectContaining({ type: 'call', tool: 'latte' }),
    expect.objectContaining({ type: 'result', tool: 'latte', status: 'ok', output: 450 }),
    { type: 'text', text: 'A latte is $4.50.' },
  ])
})

test("the daemon's error ends the turn with it", async () => {
  const { call, poll, answer } = app()
  await poll(0)
  const c = await call('start.000002')
  const sent = call('send.000002', { conversation: c.id, text: 'hi' }).then(
    () => '',
    (e: Error) => e.message,
  )
  const { job } = (await (await poll()).json()) as { job: { id: string } }
  await answer(job.id, { error: 'bridge limit reached: daily tokens' })
  expect(await sent).toContain('bridge limit reached')
})

test('AGENT_BRIDGE picks the default; a conversation can swap any time', async () => {
  process.env.AGENT_BRIDGE = 'api'
  const { agent, call } = app([
    fakeBridge(['from rust'], { id: 'rust' }),
    fakeBridge(['from the api'], { id: 'api' }),
  ])
  const c = await call('start.000002')
  expect(c.bridge).toBe('api')
  const ctx = { user: { id: 'u-owner' } } as never
  expect((await agent.update(ctx, c.id, { bridge: 'rust' })).bridge).toBe('rust')
})

test('plain words with no JSON are the answer; the prompt says how to call', () => {
  expect(readAnswer('Sure, all done.')).toEqual({ text: 'Sure, all done.', calls: [] })
  const prompt = promptFor({
    system: 'S',
    messages: [],
    tools: [],
    signal: new AbortController().signal,
    who: 'u',
    text: () => {},
  })
  expect(prompt).toContain('"calls"')
})
