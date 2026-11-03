// `.weft/contract.json` (research 28 §4): functions as JSON Schema with tags, cache and auth; C001 for a schema with
// no converter, C002 for a value its `output` rejects; Q012 when the database or auth reaches the client graph.
import { z } from 'zod'
import { busProblem, describe as contract } from '../src/contract.mjs'
import { holdsSockets } from '../src/live-target.mjs'
import { createScope, fetchQuery } from '../src/exec'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import weftStart, { clientStubs, withIds } from '../src/vite.mjs'

const fn = (kind, $id, def) => ({ kind, $id, def })
const bare = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }

test('one entry per function, sorted, in JSON Schema', () => {
  const { functions, diagnostics } = contract(new Map([
    ['b', fn('mutation', 'addTodo.a1b2c3', { input: z.object({ title: z.string().min(1) }), output: z.object({ id: z.string() }), auth: 'user', invalidates: ['todos'] })],
    ['a', fn('query', 'listTodos.d4e5f6', { tags: ['todos'], cache: { life: 'minutes', scope: 'user' } })],
    ['c', fn('query', 'getTodo.000000', { input: z.object({ id: z.string() }), tags: ({ id }) => [`todo:${id}`] })],
    ['d', fn('mutation', 'rename.111111', { invalidates: () => [] })],
  ]))
  expect(diagnostics).toEqual([])
  expect(functions.map(f => f.name)).toEqual(['addTodo', 'getTodo', 'listTodos', 'rename'])
  expect(functions[0]).toMatchObject({
    id: 'addTodo.a1b2c3', kind: 'mutation', invalidates: ['todos'], auth: 'user', errors: ['Q002', 'A002', 'Q010'],
    input: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } } },
    output: { type: 'object', required: ['id'] },
  })
  expect(functions[1]).toMatchObject({ tags: 'dynamic', cache: null, auth: 'public', errors: ['Q002'] })
  expect(functions[2]).toMatchObject({ input: null, output: null, tags: ['todos'], cache: { life: 'minutes', scope: 'user' } })
  expect(functions[3]).toMatchObject({ invalidates: 'dynamic' })
})

test('C001: a schema with no JSON Schema is `{}` and a warning', () => {
  const { functions, diagnostics } = contract(new Map([['a', fn('query', 'odd', { input: bare })]]))
  expect(functions[0].input).toEqual({})
  expect(diagnostics).toMatchObject([{ code: 'C001', severity: 'warning' }])
  expect(diagnostics[0].why).toContain('`odd`')
})

test('C002: dev and tests check the value against `output`; production doesn\'t', async () => {
  const f = fn('query', 'typed', { output: z.object({ id: z.string() }), run: () => ({ id: 1 }) })
  const dev = createScope(new Request('http://localhost/'), { dev: true })
  await expect(fetchQuery(dev, f, undefined)).rejects.toMatchObject({ code: 'C002', message: expect.stringContaining('id:') })
  expect((await fetchQuery(createScope(new Request('http://localhost/')), f, undefined)).v).toEqual({ id: 1 })
})

test('Q012: the database or auth in the client graph stops the build; on the server it passes through', () => {
  const plugin = weftStart({ root: import.meta.dirname }).find?.(p => p.resolveId?.handler) ?? weftStart({ root: import.meta.dirname })
  const { handler, filter } = plugin.resolveId
  for (const id of ['@weft-js/start/db', '@weft-js/start/db/sqlite', '@weft-js/start/db/postgres', '@weft-js/start/auth']) expect(filter.id.test(id)).toBe(true)
  expect(filter.id.test('@weft-js/start/data')).toBe(false)
  const ctx = consumer => ({ environment: { config: { consumer } }, error(m) { throw new Error(m) } })
  expect(() => handler.call(ctx('client'), '@weft-js/start/db/sqlite', `${import.meta.dirname}/page.tsx`)).toThrow(/^Q012: .*page\.tsx/)
  expect(handler.call(ctx('server'), '@weft-js/start/auth', 'x')).toBeUndefined()
})

test('a stream is in the contract, with its message; R005: an unbounded input warns', () => {
  const { functions, diagnostics } = contract(new Map([
    ['s', fn('stream', 'feed.a1b2c3', { input: z.object({ room: z.string(), ids: z.array(z.string().max(4)) }), message: z.object({ text: z.string() }) })],
    ['b', fn('stream', 'ok.a1b2c3', { input: z.object({ room: z.string().max(40), kind: z.enum(['a', 'b']), ids: z.array(z.string().max(4)).max(8) }) })],
  ]))
  expect(functions[0]).toMatchObject({ kind: 'stream', output: { type: 'object', required: ['text'] } })
  expect(diagnostics).toEqual([{ code: 'R005', severity: 'warning', why: expect.stringContaining('`input.room` has no upper bound') }])
})

test('a channel is in the contract; R005 covers its params and client messages', () => {
  const { functions, diagnostics } = contract(new Map([['c', fn('channel', 'room.a', { params: z.object({ id: z.string() }), client: { say: z.object({ text: z.string().max(9) }), bad: z.object({ text: z.string() }) }, server: { said: z.object({ text: z.string() }) } })]]))
  expect(functions[0]).toMatchObject({ kind: 'channel', auth: 'authorize', client: { say: { properties: { text: { maxLength: 9 } } } } })
  expect(diagnostics.map(d => d.why)).toEqual([expect.stringContaining('`params.id`'), expect.stringContaining('`client.bad.text`')])
})

test('a shared state is bounded by the same check', () => {
  const { diagnostics } = contract(new Map([['s', fn('shared', 'deck.a', { key: z.string(), value: z.number() })]]))
  expect(diagnostics.map(d => d.why)).toEqual([expect.stringContaining('`key`')])
})

test('R002: `durableObjectBus` outside `cloudflare_durable`', () => {
  expect(busProblem({ preset: 'cloudflare_module', bus: 'durable-object', streams: true })).toContain('cloudflare_durable')
  expect(busProblem({ preset: 'cloudflare_durable', bus: 'durable-object', streams: true })).toBeUndefined()
})

test('R001 at build, with the line; a client stub keeps `initial` and drops the rest', () => {
  const code = `import { channel, sharedState } from '@weft-js/start'\nexport const room = channel({ client: {} })\n`
  expect(() => withIds(code, 'chat.ts', 'src/server/chat.ts')).toThrow(/R001: src\/server\/chat.ts:2 `room`/)
  const ok = `import { channel, sharedState } from '@weft-js/start'\nimport { db } from './db'\nexport const room = channel({ authorize: () => db.ok(), on: { say: () => db.write() } })\nexport const n = sharedState('n', { key: k, value: v, initial: { a: 1 }, authorize: { read, write } })\n`
  expect(withIds(ok, 'chat.ts', 'src/server/chat.ts')).toContain('$id: "room.')
  const stub = clientStubs(ok, 'chat.ts', 'src/server/chat.ts')
  expect(stub).toMatch(/channel\(\{ \$id: "room\.\w+", \$stub: 1 \}\)/)
  expect(stub).toMatch(/sharedState\('', \{ \$id: "n\.\w+", \$stub: 1, initial: \{ a: 1 \} \}\)/)
  expect(stub).not.toContain('db')
})

test('R002: the memory bus on a multi-instance preset, only in an app that uses realtime', () => {
  const root = fileURLToPath(new URL('./fixtures/app', import.meta.url))
  expect(busProblem({ preset: 'vercel', bus: 'memory', streams: true, root })).toContain('`vercel` preset runs many instances')
  expect(busProblem({ preset: 'vercel', bus: 'postgres', streams: true, root })).toBeUndefined()
  expect(busProblem({ preset: 'node', bus: 'memory', streams: true, root })).toBeUndefined()
  expect(busProblem({ preset: 'cloudflare_module', bus: 'memory', streams: false, root })).toContain('cloudflare') // the fixture's `.live()`
  expect(busProblem({ preset: 'vercel', bus: 'memory', streams: false, root: fileURLToPath(new URL('./fixtures/scan', import.meta.url)) })).toBeUndefined()
})

test('R024: which presets can hold a browser\'s socket', () => {
  expect(['node_server', 'bun', 'deno_server', 'cloudflare_durable', 'deno_deploy'].filter(p => !holdsSockets(p))).toEqual([])
  expect(['netlify', 'vercel', 'aws_lambda', 'azure_functions', 'cloudflare_module', 'firebase'].filter(holdsSockets)).toEqual([])
})

test('R002 reads a `.live(` call, not the word in prose', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-live-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/a.ts'), "export const why = 'and .live() keeps it in step'\n")
  expect(busProblem({ preset: 'vercel', bus: 'memory', streams: false, root })).toBeUndefined()
  writeFileSync(join(root, 'src/b.ts'), 'export const list = () => notes.live()\n')
  expect(busProblem({ preset: 'vercel', bus: 'memory', streams: false, root })).toContain('many instances')
  rmSync(root, { recursive: true, force: true })
})

test('a stream gets a client stub, and a topic stays on the server', () => {
  const source = `import { stream, topic } from '@weft-js/start'\nimport { db } from '../db'\nexport const t = topic('t', { message: db })\nexport const s = stream({ async *run() { yield* t.subscribe('k') } })\n`
  const out = clientStubs(source, 'x.ts', 'src/server/x.ts')
  expect(out).toContain('stream({ $id: "s.')
  expect(out).not.toContain('topic(')
  expect(out).not.toContain('../db')
})

test('types keep no value: a schema read only by `z.infer` stays out of the stub, and zod with it', () => {
  const source = `import { mutation } from '@weft-js/start'
import { z } from 'zod'
const input = z.object({ title: z.string() })
export type Input = z.infer<typeof input>
export interface Saved extends Input { id: typeof input }
export const save = mutation({ input, run: ({ input }) => input })
`
  const out = clientStubs(source, 'x.ts', 'src/server/x.ts')
  expect(out).toContain('mutation({ $id: "save.')
  expect(out).not.toContain('zod')
  expect(out).not.toContain('z.object')
  expect(out).not.toContain('infer')
})

test('a stub keeps what `optimistic` reads, not what its parameters, property names or annotations spell', () => {
  const source = `import { mutation } from '@weft-js/start'
import { z } from 'zod'
import { pick } from './pick'
const input = z.object({ title: z.string() })
const title = z.string()
const render = (row: z.infer<typeof input>) => pick(row)
export enum Kind { A = 'a' }
export const save = mutation({ input, optimistic: ({ input }, cache) => cache.title = render(input) + Kind.A, run() {} })
`
  const out = clientStubs(source, 'x.ts', 'src/server/x.ts')
  expect(out).toContain('const render =')
  expect(out).toContain('enum Kind')
  expect(out).toContain("from './pick'")
  expect(out).not.toContain('z.object')
  expect(out).not.toContain('z.string')
  expect(out).not.toContain('zod')
})

test('a value read inside a type-free position still keeps its import', () => {
  const source = `import { mutation } from '@weft-js/start'
import { z } from 'zod'
import Icon from './icon'
const input = z.object({ title: z.string() })
const check = () => [typeof input, <Icon />, input as unknown]
export const save = mutation({ optimistic: () => check(), run() {} })
`
  const out = clientStubs(source, 'x.tsx', 'src/server/x.tsx')
  expect(out).toContain("from 'zod'")
  expect(out).toContain('import Icon')
})
