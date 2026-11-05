// Server functions over HTTP on the fixture app under `weft dev` (research 27 §3): `/_weft/fn/<id>` for queries and
// mutations, the CSRF check, validation, single-flight refreshes, the shared tagged cache, redirects from `load` and
// from a `run`, the request cache shared by `load` and the render, the page's `#weft-cache`, and the client stubs.
import { inject } from 'vitest'
import { fnId } from '../src/vite.mjs'

const url = inject('url')
const id = (name: string) => fnId(name, 'src/server/todos.ts')
const get = (path: string, init?: RequestInit) => fetch(url + path, { redirect: 'manual', ...init })
const call = (name: string, input?: unknown) =>
  get(
    `/_weft/fn/${id(name)}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`,
  )
const post = (
  name: string,
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json', 'x-weft': '1' },
) => get(`/_weft/fn/${id(name)}`, { method: 'POST', headers, body: JSON.stringify(body) })
const cacheOf = (text: string) =>
  JSON.parse(
    /<script type="application\/json" id="weft-cache">(.*?)<\/script>/.exec(text)?.[1] ?? 'null',
  )

test('a query answers { v, t }', async () => {
  const res = await call('getTodo', { id: '2' })
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({
    v: { id: '2', title: 'Build the cache', done: expect.any(Boolean) },
    t: ['todos', 'todo:2'],
  })
})

test('Q002: input the schema rejects is a 400 with the issues', async () => {
  const res = await call('getTodo', { id: 2 })
  expect(res.status).toBe(400)
  expect((await res.json()).e).toMatchObject({
    code: 'Q002',
    issues: [{ message: 'expected a string', path: ['id'] }],
  })
})

test('Q009: an unknown id is a 404', async () => {
  const res = await get('/_weft/fn/nope.123456')
  expect(res.status).toBe(404)
  expect((await res.json()).e.code).toBe('Q009')
})

test('Q010: a mutation without the CSRF proof is refused', async () => {
  const plain = await post('addTodo', { i: { title: 'x' } }, { 'content-type': 'application/json' })
  expect(plain.status).toBe(403)
  expect((await plain.json()).e.code).toBe('Q010')
  const cross = await post(
    'addTodo',
    { i: { title: 'x' } },
    { 'content-type': 'application/json', 'x-weft': '1', origin: 'https://evil.example' },
  )
  expect(cross.status).toBe(403)
  expect((await get(`/_weft/fn/${id('addTodo')}`)).status).toBe(405) // GET a mutation
})

test('a mutation refreshes the queries it invalidated in the same response (single-flight)', async () => {
  const res = await post('addTodo', {
    i: { title: 'From the test' },
    f: [
      [id('listTodos'), null],
      [id('getTodo'), { id: '1' }],
      [id('nope'), null],
    ],
  })
  expect(res.status).toBe(200)
  const a = await res.json()
  expect(a.v).toMatchObject({ title: 'From the test', done: false })
  expect(a.t).toEqual(['todos'])
  expect(a.c.map((w: unknown[]) => [w[0], w[1]])).toEqual([
    [id('listTodos'), null],
    [id('getTodo'), { id: '1' }],
  ])
  expect(a.c[0][2].at(-1)).toMatchObject({ title: 'From the test' })
})

test('the shared cache serves a cached query until a mutation invalidates its tag', async () => {
  const first = (await (await call('todoStats')).json()).v
  const again = (await (await call('todoStats')).json()).v
  expect(again).toEqual(first) // one run for both requests
  await post('toggleTodo', { i: { id: '3' } })
  const after = (await (await call('todoStats')).json()).v
  expect(after.runs).toBe(first.runs + 1)
})

test('Q006: a cached query that reads the request fails', async () => {
  const res = await call('leaky')
  expect(res.status).toBe(500)
  expect((await res.json()).e.code).toBe('Q006')
})

test('redirect() in load: 307 for the page, { r } for client navigation', async () => {
  const page = await get('/old')
  expect(page.status).toBe(307)
  expect(page.headers.get('location')).toBe('/todos')
  expect(await (await get('/_weft/data/old')).json()).toEqual({
    m: [],
    p: '/old',
    s: 307,
    r: '/todos',
  })
})

test('redirect() in a run answers { r }, with the cookies the run set', async () => {
  const res = await post('signIn', {})
  expect(await res.json()).toEqual({ r: '/todos' })
  expect(res.headers.get('set-cookie')).toBe('session=abc; Path=/; HttpOnly')
})

test('load and the render share one run per request; the page carries it in #weft-cache', async () => {
  const before = (await (await call('todoStats')).json()).v
  const r = await get('/todos')
  const text = await r.text()
  expect(r.status).toBe(200)
  expect(text).toMatch(/<title data-wm>Todos \(\d+\) · Acme<\/title>/)
  const cached = cacheOf(text)
  expect(cached.map((w: unknown[]) => w[0])).toEqual([id('listTodos')])
  const [, input, list, tags] = cached[0]
  expect(input).toBe(null)
  expect(tags).toEqual(['todos'])
  expect(text).toContain(`>${list[0].title}</button>`)
  // The route payload records the tags its load read.
  const route = JSON.parse(
    /<script type="application\/json" id="weft-route">(.*?)<\/script>/.exec(text)![1]!,
  )
  expect(route.m.at(-1)).toMatchObject({ id: '/todos', t: ['todos'] })
  expect(before).toBeTruthy()
})

test('client navigation data carries the queries its loaders resolved', async () => {
  const a = await (await get('/_weft/data/todos')).json()
  expect(a.c.map((w: unknown[]) => w[0])).toEqual([id('listTodos')])
  expect(a.m.at(-1).t).toEqual(['todos'])
})

test('the client gets stubs: ids and optimistic, no run, no server imports', async () => {
  const code = await (await get('/src/server/todos.ts')).text()
  expect(code).toContain(`$id: "${id('listTodos')}"`)
  expect(code).toContain('optimistic')
  expect(code).not.toContain('db-secret')
  expect(code).not.toMatch(/\brun\b/)
  expect(code).not.toContain('../db')
  expect(code).not.toContain('SERVER_ONLY')
})
