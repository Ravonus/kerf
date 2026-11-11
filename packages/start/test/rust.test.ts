// `remote()` against a stand-in sidecar on a real socket (research 36): what crosses, and every way a call can come back.
// The real crate is covered by `cargo test` in crates/kerf and by evals/gates/phase5a-exit.mjs.
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { z } from 'zod'
import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { fns, mutation, query, raise, StartError } from '../src/data'
import { createScope, fetchQuery, memoryStore, runMutation, type ScopeOptions } from '../src/exec'
import { urlVariable as cliVariable } from '../src/sidecar.mjs'
import { remote, sign, urlVariable, type Claims } from '../src/rust'
import { registerContractTests } from './rust.contract'
import { registerCargoTests } from './rust.cargo'
import { registerNativeTests } from './rust.native'

const SECRET = 's3cret'
type Envelope = { user: Claims | null; deadlineMs: number; iat: number; traceparent: string }
type Seen = { url: string; headers: IncomingHttpHeaders; body: string; envelope: Envelope }
type Member = { id: string; org: string; plan: string }
let server: Server
let base: string
let seen: Seen[] = []
let answer: (s: Seen) => { status?: number; json: unknown } = () => ({
  json: { ok: true, value: null },
})

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (d) => {
      body += d
    })
    req.on('end', () => {
      const s = {
        url: req.url!,
        headers: req.headers,
        body,
        envelope: JSON.parse(Buffer.from(String(req.headers['kerf-ctx']), 'base64url').toString()),
      }
      seen.push(s)
      const a = answer(s)
      res.writeHead(a.status ?? 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(a.json))
    })
  })
  await new Promise<void>((ok) => {
    server.listen(0, '127.0.0.1', ok)
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => void server.close())
beforeEach(() => {
  seen = []
  process.env.KERF_RUST_SEARCH_URL = base
  process.env.KERF_RUST_SECRET = SECRET
})
afterEach(() => {
  delete process.env.KERF_RUST_SEARCH_URL
  delete process.env.KERF_RUST_SECRET
})

const scope = (options: ScopeOptions = {}, init: RequestInit = {}) =>
  createScope(new Request('http://localhost/x', init), { store: memoryStore(), ...options })
const search = remote('rust://search')
let n = 0
const define = (def: object, kind: 'query' | 'mutation' = 'query') => {
  const make = (kind === 'query' ? query : mutation) as (d: object) => { $id: string }
  return make({ $id: `f${++n}.abc123`, impl: search, output: z.any(), ...def })
}
const fnOf = (q: { $id: string }) => fns.get(q.$id)!

test('a call is signed over the function, the claims and the body, and carries no cookie', async () => {
  answer = () => ({ json: { ok: true, value: [1], tags: [], touched: [] } })
  const q = define({ input: z.object({ q: z.string() }) })
  const s = scope(
    { context: () => ({ user: { id: 7, role: 'admin', email: 'secret@example.com' } }) },
    {
      headers: {
        cookie: 'session=abc',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    },
  )
  await fetchQuery(s, fnOf(q), { q: 'x' })
  const c = seen[0]!
  expect(c.url).toBe(`/_kerf/fn/${q.$id}`)
  expect(c.body).toBe('{"input":{"q":"x"}}')
  expect(c.headers.cookie).toBeUndefined()
  expect(c.headers['kerf-sig']).toBe(
    createHmac('sha256', SECRET)
      .update(`kerf1\n${q.$id}\n${String(c.headers['kerf-ctx'])}\n${c.body}`)
      .digest('hex'),
  )
  expect(c.envelope.user).toEqual({ id: '7', roles: ['admin'] }) // claims, not the user: no email
  expect(c.envelope.deadlineMs).toBe(10_000)
  expect(Math.abs(c.envelope.iat - Date.now())).toBeLessThan(5000)
  expect(c.envelope.traceparent).toMatch(
    /^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7)[0-9a-f]{16}-01$/,
  )
})

test('the signature matches the vector the crate checks', async () => {
  const ctx =
    'eyJ1c2VyIjp7ImlkIjoidTEiLCJyb2xlcyI6WyJhZG1pbiJdfSwicmVxdWVzdElkIjoicjEiLCJkZWFkbGluZU1zIjoxMDAwLCJ0cmFjZXBhcmVudCI6bnVsbCwiaWF0IjoxMDAwMDAwfQ'
  expect(await sign('s3cret', 'f.abc', ctx, '{"input":{"q":"x"}}')).toBe(
    '2f1e20f81794af5526c0209b9d5e225945ea0c48b2c1594f666b30a33d127b10',
  ) // crates/kerf/src/envelope.rs
})

test('a junk traceparent starts a new trace', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  await fetchQuery(scope({}, { headers: { traceparent: 'nope' } }), fnOf(define({})), undefined)
  expect(seen[0]!.envelope.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
})

test('parsed input is sent: trimmed, defaults filled, and a codec encoded back to the wire', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const at = z.codec(z.iso.datetime(), z.date(), {
    decode: (s) => new Date(s),
    encode: (d) => d.toISOString(),
  })
  const q = define({ input: z.object({ q: z.string().trim(), limit: z.int().default(20), at }) })
  await fetchQuery(scope(), fnOf(q), { q: '  hi  ', at: '2026-10-31T00:00:00.000Z' })
  expect(JSON.parse(seen[0]!.body).input).toEqual({
    q: 'hi',
    limit: 20,
    at: '2026-10-31T00:00:00.000Z',
  })
})

test('a schema with no encode is sent as parsed, and no input is null', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const bare = {
    '~standard': { version: 1, vendor: 't', validate: (v: unknown) => ({ value: v }) },
  }
  await fetchQuery(scope(), fnOf(define({ input: bare })), { a: 1 })
  await fetchQuery(scope(), fnOf(define({})), undefined)
  expect(seen.map((s) => JSON.parse(s.body).input)).toEqual([{ a: 1 }, null])
})

test('the output is validated and parsed in production too, so a codec gives its value', async () => {
  const at = z.codec(z.iso.datetime(), z.date(), {
    decode: (s) => new Date(s),
    encode: (d) => d.toISOString(),
  })
  answer = () => ({
    json: { ok: true, value: { at: '2026-10-31T00:00:00.000Z', extra: 'dropped' } },
  })
  const e = await fetchQuery(scope(), fnOf(define({ output: z.object({ at }) })), undefined)
  expect(e.v).toEqual({ at: new Date('2026-10-31T00:00:00.000Z') })
})

test('R103: an output the schema rejects, and `validate: false` trusts it', async () => {
  answer = () => ({ json: { ok: true, value: { id: 1 } } })
  await expect(
    fetchQuery(scope(), fnOf(define({ output: z.object({ id: z.string() }) })), undefined),
  ).rejects.toMatchObject({ code: 'R103', status: 502, message: expect.stringContaining('id:') })
  const trust = define({
    output: z.object({ id: z.string() }),
    impl: remote('rust://search', { validate: false }),
  })
  expect((await fetchQuery(scope(), fnOf(trust), undefined)).v).toEqual({ id: 1 })
})

test('a declared error keeps its code and checked data; an undeclared one is drift', async () => {
  const errors = { NotFound: z.object({ id: z.string() }) }
  answer = () => ({ json: { ok: false, error: { code: 'NotFound', data: { id: 'x' } } } })
  await expect(fetchQuery(scope(), fnOf(define({ errors })), undefined)).rejects.toMatchObject({
    code: 'NotFound',
    status: 400,
    data: { id: 'x' },
  })
  await expect(fetchQuery(scope(), fnOf(define({})), undefined)).rejects.toMatchObject({
    code: 'R103',
  })
  answer = () => ({ json: { ok: false, error: { code: 'NotFound', data: { id: 1 } } } })
  await expect(fetchQuery(scope(), fnOf(define({ errors })), undefined)).rejects.toMatchObject({
    code: 'R103',
  })
})

test("`run` raises the same error, so the client can't tell which body it was", async () => {
  const q = query({
    $id: `raise${++n}.abc123`,
    errors: { NotFound: z.object({ id: z.string() }) },
    run: () => raise('NotFound', { id: 'x' }),
  })
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({
    code: 'NotFound',
    status: 400,
    data: { id: 'x' },
  })
})

test('each failure of the sidecar has its code, and none of them leaks an address', async () => {
  const q = define({})
  const code = async (status: number, json: unknown) => {
    answer = () => ({ status, json })
    const e = (await fetchQuery(scope(), fnOf(q), undefined).catch((x) => x)) as StartError
    expect(e).toBeInstanceOf(StartError)
    expect(e.message).not.toContain(base)
    return [e.code, e.status]
  }
  expect(await code(500, { ok: false, error: { code: 'Internal', requestId: 'r9' } })).toEqual([
    'R108',
    500,
  ])
  expect(await code(401, { ok: false, error: { code: 'Refused', message: 'no' } })).toEqual([
    'R106',
    503,
  ])
  expect(await code(504, { ok: false, error: { code: 'Deadline' } })).toEqual(['R107', 504])
  expect(
    await code(422, { ok: false, error: { code: 'Drift', message: 'missing field' } }),
  ).toEqual(['R103', 502])
  expect(await code(500, 'not the protocol')).toEqual(['R108', 500])
})

test("R108 names the request id, for the sidecar's log", async () => {
  answer = () => ({
    status: 500,
    json: { ok: false, error: { code: 'Internal', requestId: 'r9' } },
  })
  await expect(fetchQuery(scope(), fnOf(define({})), undefined)).rejects.toThrow('request r9')
})

test('R106: no address, and no key; R107: nothing listening, and a timeout', async () => {
  const q = define({})
  delete process.env.KERF_RUST_SEARCH_URL
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({
    code: 'R106',
    message: expect.stringContaining('KERF_RUST_SEARCH_URL'),
  })
  process.env.KERF_RUST_SEARCH_URL = base
  delete process.env.KERF_RUST_SECRET
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({
    code: 'R106',
    message: expect.stringContaining('KERF_RUST_SECRET'),
  })
  process.env.KERF_RUST_SECRET = SECRET
  process.env.KERF_RUST_SEARCH_URL = 'http://127.0.0.1:1'
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({
    code: 'R107',
    status: 503,
  })
  const silent = createServer(() => {})
  await new Promise<void>((ok) => {
    silent.listen(0, '127.0.0.1', ok)
  })
  const slow = define({
    impl: remote('rust://search', {
      url: `http://127.0.0.1:${(silent.address() as AddressInfo).port}`,
      timeout: 40,
    }),
  })
  await expect(fetchQuery(scope(), fnOf(slow), undefined)).rejects.toMatchObject({
    code: 'R107',
    status: 504,
  })
  silent.closeAllConnections()
  silent.close()
})

test("a target that isn't a sidecar is refused where it's written", () => {
  expect(() => remote('http://example.com')).toThrow(/R106/)
  expect(() => remote('rust://Search')).toThrow(/R106/)
  expect(remote('rust://search-index').service).toBe('search-index')
})

test('the CLI and the server spell the variable the same way', () => {
  expect(urlVariable('search-index')).toBe('KERF_RUST_SEARCH_INDEX_URL')
  expect(cliVariable('search-index')).toBe(urlVariable('search-index'))
})

test('`claims` chooses what a sidecar sees', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const q = define({
    impl: remote('rust://search', {
      claims: (user) => {
        const u = user as Member
        return { id: u.id, tenant: u.org, plan: u.plan }
      },
    }),
  })
  await fetchQuery(
    scope({ context: () => ({ user: { id: 'u', org: 'o', plan: 'pro', email: 'x' } }) }),
    fnOf(q),
    undefined,
  )
  expect(seen[0]!.envelope.user).toEqual({ id: 'u', tenant: 'o', plan: 'pro' })
})

test("auth: 'user' is refused in TS, before anything crosses", async () => {
  const q = define({ auth: 'user' })
  await expect(
    fetchQuery(scope({ context: () => ({ user: null }) }), fnOf(q), undefined),
  ).rejects.toMatchObject({ code: 'A002' })
  expect(seen).toEqual([])
})

describe('the caches', () => {
  const reply =
    (extra = {}) =>
    () => ({ json: { ok: true, value: seen.length, tags: [], touched: [], ...extra } })

  test('a shared query sends no user, and hits the sidecar once', async () => {
    answer = reply()
    const q = define({ tags: ['docs'], cache: { life: 'minutes' } })
    const store = memoryStore()
    const context = () => ({ user: { id: 'u' } })
    expect((await fetchQuery(scope({ store, context }), fnOf(q), undefined)).v).toBe(1)
    expect((await fetchQuery(scope({ store, context }), fnOf(q), undefined)).v).toBe(1)
    expect(seen.length).toBe(1)
    expect(seen[0]!.envelope.user).toBe(null)
  })

  test('`scope: user` sends the user, one value each', async () => {
    answer = reply()
    const q = define({ tags: ['docs'], cache: { life: 'minutes', scope: 'user' } })
    const store = memoryStore()
    await fetchQuery(scope({ store, context: () => ({ user: { id: 'a' } }) }), fnOf(q), undefined)
    await fetchQuery(scope({ store, context: () => ({ user: { id: 'b' } }) }), fnOf(q), undefined)
    expect(seen.map((s) => s.envelope.user?.id)).toEqual(['a', 'b'])
  })

  test("a tag Rust adds joins the query's, and invalidates the cached value", async () => {
    answer = reply({ tags: ['doc:1'] })
    const q = define({ tags: ['docs'], cache: { life: 'minutes' } })
    const store = memoryStore()
    const e = await fetchQuery(scope({ store }), fnOf(q), undefined)
    expect(e.tags).toEqual(['docs', 'doc:1'])
    await store.bump(['doc:1'])
    expect((await fetchQuery(scope({ store }), fnOf(q), undefined)).v).toBe(2)
  })

  test("a tag a mutation's Rust adds is invalidated with the declared ones", async () => {
    answer = reply({ tags: ['doc:1'] })
    const m = define({ invalidates: ['docs'] }, 'mutation')
    const out = await runMutation(scope({}, { method: 'POST' }), fnOf(m), undefined, [])
    expect(out.t).toEqual(['docs', 'doc:1'])
  })

  test("touched tables feed Q011 in dev, as a TS `run`'s do", async () => {
    answer = reply({ touched: ['docs', 'users'] })
    const out: string[] = []
    const q = define({ tags: ['docs'] })
    await fetchQuery(
      scope({ dev: true, onDiagnostic: (d) => out.push(d.code + d.message) }),
      fnOf(q),
      undefined,
    )
    expect(out).toEqual([expect.stringMatching(/^Q011.*table `users`/)])
  })
})

test('both `run` and `impl` is refused at definition', () => {
  expect(() =>
    query({ $id: 'both.abc123', impl: search, output: z.any(), run: () => 1 } as never),
  ).toThrow(/R103.*both/s)
})

test('a replaced function in a test crosses nothing', async () => {
  const q = define({})
  const handlers = new Map([[q.$id, () => 'faked']])
  expect((await fetchQuery(scope({ handlers }), fnOf(q), undefined)).v).toBe('faked')
  expect(seen).toEqual([])
})

registerContractTests(search)

registerCargoTests()

registerNativeTests({ scope, fnOf, nextId: () => ++n, seen: () => seen })
