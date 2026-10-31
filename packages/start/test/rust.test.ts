// `remote()` against a stand-in sidecar on a real socket (research 36): what crosses, and every way a call can come back.
// The real crate is covered by `cargo test` in crates/weft and by evals/phase5a-exit.mjs.
import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { z } from 'zod'
import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { fns, mutation, query, raise, StartError } from '../src/data'
import { createScope, fetchQuery, memoryStore, runMutation } from '../src/exec'
import { describe as contract } from '../src/contract.mjs'
import { readCargo, urlVariable as cliVariable } from '../src/sidecar.mjs'
import { remote, sign, urlVariable } from '../src/rust'

const SECRET = 's3cret'
type Seen = { url: string; headers: Record<string, any>; body: string; envelope: any }
let server: Server
let base: string
let seen: Seen[] = []
let answer: (s: Seen) => { status?: number; json: unknown } = () => ({ json: { ok: true, value: null } })

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      const s = { url: req.url!, headers: req.headers, body, envelope: JSON.parse(Buffer.from(String(req.headers['weft-ctx']), 'base64url').toString()) }
      seen.push(s)
      const a = answer(s)
      res.writeHead(a.status ?? 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(a.json))
    })
  })
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as any).port}`
})
afterAll(() => void server.close())
beforeEach(() => {
  seen = []
  process.env.WEFT_RUST_SEARCH_URL = base
  process.env.WEFT_RUST_SECRET = SECRET
})
afterEach(() => {
  delete process.env.WEFT_RUST_SEARCH_URL
  delete process.env.WEFT_RUST_SECRET
})

const scope = (options: any = {}, init: RequestInit = {}) => createScope(new Request('http://localhost/x', init), { store: memoryStore(), ...options })
const search = remote('rust://search')
let n = 0
const define = (def: any, kind: 'query' | 'mutation' = 'query') => (kind === 'query' ? query : mutation)({ $id: `f${++n}.abc123`, impl: search, output: z.any(), ...def }) as any
const fnOf = (q: any) => fns.get(q.$id)!

test('a call is signed over the function, the claims and the body, and carries no cookie', async () => {
  answer = () => ({ json: { ok: true, value: [1], tags: [], touched: [] } })
  const q = define({ input: z.object({ q: z.string() }) })
  const s = scope({ context: () => ({ user: { id: 7, role: 'admin', email: 'secret@example.com' } }) }, { headers: { cookie: 'session=abc', traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' } })
  await fetchQuery(s, fnOf(q), { q: 'x' })
  const [c] = seen
  expect(c.url).toBe(`/_weft/fn/${q.$id}`)
  expect(c.body).toBe('{"input":{"q":"x"}}')
  expect(c.headers.cookie).toBeUndefined()
  expect(c.headers['weft-sig']).toBe(createHmac('sha256', SECRET).update(`weft1\n${q.$id}\n${c.headers['weft-ctx']}\n${c.body}`).digest('hex'))
  expect(c.envelope.user).toEqual({ id: '7', roles: ['admin'] }) // claims, not the user: no email
  expect(c.envelope.deadlineMs).toBe(10_000)
  expect(Math.abs(c.envelope.iat - Date.now())).toBeLessThan(5000)
  expect(c.envelope.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7)[0-9a-f]{16}-01$/)
})

test('the signature matches the vector the crate checks', async () => {
  const ctx = 'eyJ1c2VyIjp7ImlkIjoidTEiLCJyb2xlcyI6WyJhZG1pbiJdfSwicmVxdWVzdElkIjoicjEiLCJkZWFkbGluZU1zIjoxMDAwLCJ0cmFjZXBhcmVudCI6bnVsbCwiaWF0IjoxMDAwMDAwfQ'
  expect(await sign('s3cret', 'f.abc', ctx, '{"input":{"q":"x"}}')).toBe('1a4c89d125bdeda4db5f2dd02045bc1044ff4ecfacff00c7f42f602ceef3ad08') // crates/weft/src/envelope.rs
})

test('a junk traceparent starts a new trace', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  await fetchQuery(scope({}, { headers: { traceparent: 'nope' } }), fnOf(define({})), undefined)
  expect(seen[0].envelope.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
})

test('parsed input is sent: trimmed, defaults filled, and a codec encoded back to the wire', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const at = z.codec(z.iso.datetime(), z.date(), { decode: s => new Date(s), encode: d => d.toISOString() })
  const q = define({ input: z.object({ q: z.string().trim(), limit: z.int().default(20), at }) })
  await fetchQuery(scope(), fnOf(q), { q: '  hi  ', at: '2026-10-31T00:00:00.000Z' })
  expect(JSON.parse(seen[0].body).input).toEqual({ q: 'hi', limit: 20, at: '2026-10-31T00:00:00.000Z' })
})

test('a schema with no encode is sent as parsed, and no input is null', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const bare = { '~standard': { version: 1, vendor: 't', validate: (v: unknown) => ({ value: v }) } }
  await fetchQuery(scope(), fnOf(define({ input: bare })), { a: 1 })
  await fetchQuery(scope(), fnOf(define({})), undefined)
  expect(seen.map(s => JSON.parse(s.body).input)).toEqual([{ a: 1 }, null])
})

test('the output is validated and parsed in production too, so a codec gives its value', async () => {
  const at = z.codec(z.iso.datetime(), z.date(), { decode: s => new Date(s), encode: d => d.toISOString() })
  answer = () => ({ json: { ok: true, value: { at: '2026-10-31T00:00:00.000Z', extra: 'dropped' } } })
  const e = await fetchQuery(scope(), fnOf(define({ output: z.object({ at }) })), undefined)
  expect(e.v).toEqual({ at: new Date('2026-10-31T00:00:00.000Z') })
})

test('R103: an output the schema rejects, and `validate: false` trusts it', async () => {
  answer = () => ({ json: { ok: true, value: { id: 1 } } })
  await expect(fetchQuery(scope(), fnOf(define({ output: z.object({ id: z.string() }) })), undefined)).rejects.toMatchObject({ code: 'R103', status: 502, message: expect.stringContaining('id:') })
  const trust = define({ output: z.object({ id: z.string() }), impl: remote('rust://search', { validate: false }) })
  expect((await fetchQuery(scope(), fnOf(trust), undefined)).v).toEqual({ id: 1 })
})

test('a declared error keeps its code and checked data; an undeclared one is drift', async () => {
  const errors = { NotFound: z.object({ id: z.string() }) }
  answer = () => ({ json: { ok: false, error: { code: 'NotFound', data: { id: 'x' } } } })
  await expect(fetchQuery(scope(), fnOf(define({ errors })), undefined)).rejects.toMatchObject({ code: 'NotFound', status: 400, data: { id: 'x' } })
  await expect(fetchQuery(scope(), fnOf(define({})), undefined)).rejects.toMatchObject({ code: 'R103' })
  answer = () => ({ json: { ok: false, error: { code: 'NotFound', data: { id: 1 } } } })
  await expect(fetchQuery(scope(), fnOf(define({ errors })), undefined)).rejects.toMatchObject({ code: 'R103' })
})

test('`run` raises the same error, so the client can\'t tell which body it was', async () => {
  const q = query({ $id: `raise${++n}.abc123`, errors: { NotFound: z.object({ id: z.string() }) }, run: () => raise('NotFound', { id: 'x' }) })
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({ code: 'NotFound', status: 400, data: { id: 'x' } })
})

test('each failure of the sidecar has its code, and none of them leaks an address', async () => {
  const q = define({})
  const code = async (status: number, json: unknown) => {
    answer = () => ({ status, json })
    const e: any = await fetchQuery(scope(), fnOf(q), undefined).catch(x => x)
    expect(e).toBeInstanceOf(StartError)
    expect(e.message).not.toContain(base)
    return [e.code, e.status]
  }
  expect(await code(500, { ok: false, error: { code: 'Internal', requestId: 'r9' } })).toEqual(['R108', 500])
  expect(await code(401, { ok: false, error: { code: 'Refused', message: 'no' } })).toEqual(['R106', 503])
  expect(await code(504, { ok: false, error: { code: 'Deadline' } })).toEqual(['R107', 504])
  expect(await code(422, { ok: false, error: { code: 'Drift', message: 'missing field' } })).toEqual(['R103', 502])
  expect(await code(500, 'not the protocol')).toEqual(['R108', 500])
})

test('R108 names the request id, for the sidecar\'s log', async () => {
  answer = () => ({ status: 500, json: { ok: false, error: { code: 'Internal', requestId: 'r9' } } })
  await expect(fetchQuery(scope(), fnOf(define({})), undefined)).rejects.toThrow('request r9')
})

test('R106: no address, and no key; R107: nothing listening, and a timeout', async () => {
  const q = define({})
  delete process.env.WEFT_RUST_SEARCH_URL
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({ code: 'R106', message: expect.stringContaining('WEFT_RUST_SEARCH_URL') })
  process.env.WEFT_RUST_SEARCH_URL = base
  delete process.env.WEFT_RUST_SECRET
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({ code: 'R106', message: expect.stringContaining('WEFT_RUST_SECRET') })
  process.env.WEFT_RUST_SECRET = SECRET
  process.env.WEFT_RUST_SEARCH_URL = 'http://127.0.0.1:1'
  await expect(fetchQuery(scope(), fnOf(q), undefined)).rejects.toMatchObject({ code: 'R107', status: 503 })
  const silent = createServer(() => {})
  await new Promise<void>(ok => silent.listen(0, '127.0.0.1', ok))
  const slow = define({ impl: remote('rust://search', { url: `http://127.0.0.1:${(silent.address() as any).port}`, timeout: 40 }) })
  await expect(fetchQuery(scope(), fnOf(slow), undefined)).rejects.toMatchObject({ code: 'R107', status: 504 })
  silent.closeAllConnections()
  silent.close()
})

test('a target that isn\'t a sidecar is refused where it\'s written', () => {
  expect(() => remote('http://example.com')).toThrow(/R106/)
  expect(() => remote('rust://Search')).toThrow(/R106/)
  expect(remote('rust://search-index').service).toBe('search-index')
})

test('the CLI and the server spell the variable the same way', () => {
  expect(urlVariable('search-index')).toBe('WEFT_RUST_SEARCH_INDEX_URL')
  expect(cliVariable('search-index')).toBe(urlVariable('search-index'))
})

test('`claims` chooses what a sidecar sees', async () => {
  answer = () => ({ json: { ok: true, value: 1 } })
  const q = define({ impl: remote('rust://search', { claims: u => ({ id: u.id, tenant: u.org, plan: u.plan }) }) })
  await fetchQuery(scope({ context: () => ({ user: { id: 'u', org: 'o', plan: 'pro', email: 'x' } }) }), fnOf(q), undefined)
  expect(seen[0].envelope.user).toEqual({ id: 'u', tenant: 'o', plan: 'pro' })
})

test('auth: \'user\' is refused in TS, before anything crosses', async () => {
  const q = define({ auth: 'user' })
  await expect(fetchQuery(scope({ context: () => ({ user: null }) }), fnOf(q), undefined)).rejects.toMatchObject({ code: 'A002' })
  expect(seen).toEqual([])
})

describe('the caches', () => {
  const reply = (extra = {}) => () => ({ json: { ok: true, value: seen.length, tags: [], touched: [], ...extra } })

  test('a shared query sends no user, and hits the sidecar once', async () => {
    answer = reply()
    const q = define({ tags: ['docs'], cache: { life: 'minutes' } })
    const store = memoryStore()
    const context = () => ({ user: { id: 'u' } })
    expect((await fetchQuery(scope({ store, context }), fnOf(q), undefined)).v).toBe(1)
    expect((await fetchQuery(scope({ store, context }), fnOf(q), undefined)).v).toBe(1)
    expect(seen.length).toBe(1)
    expect(seen[0].envelope.user).toBe(null)
  })

  test('`scope: user` sends the user, one value each', async () => {
    answer = reply()
    const q = define({ tags: ['docs'], cache: { life: 'minutes', scope: 'user' } })
    const store = memoryStore()
    await fetchQuery(scope({ store, context: () => ({ user: { id: 'a' } }) }), fnOf(q), undefined)
    await fetchQuery(scope({ store, context: () => ({ user: { id: 'b' } }) }), fnOf(q), undefined)
    expect(seen.map(s => s.envelope.user?.id)).toEqual(['a', 'b'])
  })

  test('a tag Rust adds joins the query\'s, and invalidates the cached value', async () => {
    answer = reply({ tags: ['doc:1'] })
    const q = define({ tags: ['docs'], cache: { life: 'minutes' } })
    const store = memoryStore()
    const e = await fetchQuery(scope({ store }), fnOf(q), undefined)
    expect(e.tags).toEqual(['docs', 'doc:1'])
    await store.bump(['doc:1'])
    expect((await fetchQuery(scope({ store }), fnOf(q), undefined)).v).toBe(2)
  })

  test('a tag a mutation\'s Rust adds is invalidated with the declared ones', async () => {
    answer = reply({ tags: ['doc:1'] })
    const m = define({ invalidates: ['docs'] }, 'mutation')
    const out = await runMutation(scope({}, { method: 'POST' }), fnOf(m), undefined, [])
    expect(out.t).toEqual(['docs', 'doc:1'])
  })

  test('touched tables feed Q011 in dev, as a TS `run`\'s do', async () => {
    answer = reply({ touched: ['docs', 'users'] })
    const out: string[] = []
    const q = define({ tags: ['docs'] })
    await fetchQuery(scope({ dev: true, onDiagnostic: (d: any) => out.push(d.code + d.message) }), fnOf(q), undefined)
    expect(out).toEqual([expect.stringMatching(/^Q011.*table `users`/)])
  })
})

test('both `run` and `impl` is refused at definition', () => {
  expect(() => query({ $id: 'both.abc123', impl: search, output: z.any(), run: () => 1 } as any)).toThrow(/R103.*both/s)
})

test('a replaced function in a test crosses nothing', async () => {
  const q = define({})
  const handlers = new Map([[q.$id, () => 'faked']])
  expect((await fetchQuery(scope({ handlers }), fnOf(q), undefined)).v).toBe('faked')
  expect(seen).toEqual([])
})

describe('the contract', () => {
  const entry = (kind: string, id: string, def: any) => [id, { kind, $id: id, def: { impl: search, ...def } }]
  const of = (...fs: any[]) => contract(new Map(fs))

  test('a function with `impl` names its service, its context and its wire', () => {
    const at = z.codec(z.iso.datetime(), z.date(), { decode: s => new Date(s), encode: d => d.toISOString() })
    const { functions, services, diagnostics } = of(
      entry('query', 'a.111111', { input: z.object({ q: z.string() }), output: z.object({ at }), cache: { life: 'minutes' } }),
      entry('mutation', 'b.111111', { output: z.null(), auth: 'user', errors: { Gone: z.object({ id: z.string() }) } }),
      entry('query', 'c.111111', { output: z.string(), cache: { life: 'minutes', scope: 'user' } }),
      entry('query', 'd.111111', { output: z.string(), impl: remote('rust://other') }),
    ) as any
    expect(diagnostics).toEqual([])
    expect(functions[0].impl).toMatchObject({ kind: 'remote', target: 'rust://search', service: 'search', ctx: 'shared' })
    expect(functions[0].impl.output.properties.at).toMatchObject({ type: 'string', format: 'date-time' }) // what Rust sends, not the Date
    expect(functions[1].impl).toMatchObject({ ctx: 'user', errors: { Gone: { type: 'object' } } })
    expect(functions[1].errors).toContain('Gone')
    expect(functions[2].impl.ctx).toBe('ctx')
    expect(Object.keys(services).sort()).toEqual(['other', 'search'])
    expect(services.search.functions).toEqual(['a.111111', 'b.111111', 'c.111111'])
  })

  test('the hash moves with a schema, and only for its own service', () => {
    const base = () => [entry('query', 'a.1', { output: z.string() }), entry('query', 'b.1', { output: z.string(), impl: remote('rust://other') })]
    const one = of(...base()) as any
    const same = of(...base()) as any
    const edited = of(entry('query', 'a.1', { output: z.number() }), base()[1]) as any
    expect(same.services).toEqual(one.services)
    expect(edited.services.search.hash).not.toBe(one.services.search.hash)
    expect(edited.services.other.hash).toBe(one.services.other.hash)
  })

  test('an app with no sidecar has no `services`', () => {
    expect('services' in contract(new Map())).toBe(false)
  })

  test('R101: no output, what JSON can\'t carry, a one-way transform; a codec passes', () => {
    const codes = (def: any) => (of(entry('query', 'x.1', def)) as any).diagnostics.filter((d: any) => d.code === 'R101').length
    expect(codes({})).toBe(1)
    expect(codes({ output: z.date() })).toBe(1)
    expect(codes({ output: z.bigint() })).toBe(1)
    expect(codes({ output: z.void() })).toBe(1)
    expect(codes({ output: z.null(), input: z.date() })).toBe(1)
    expect(codes({ output: z.null(), input: z.object({ a: z.string().transform(s => s.length) }) })).toBe(1)
    expect(codes({ output: z.null(), input: z.array(z.object({ a: z.preprocess(v => v, z.string()) })) })).toBe(1)
    expect(codes({ output: z.null(), errors: { Bad: z.date() } })).toBe(1)
    expect(codes({ output: z.object({ a: z.string().transform(s => s.length) }) })).toBe(0) // TS parses what comes back
    expect(codes({ output: z.string(), input: z.object({ a: z.string().trim(), at: z.codec(z.iso.datetime(), z.date(), { decode: s => new Date(s), encode: d => d.toISOString() }) }) })).toBe(0)
  })

  test('R101 is only for `impl`: a TS function keeps C001', () => {
    const { diagnostics } = contract(new Map([['t', { kind: 'query', $id: 't.1', def: { output: z.date() } }]]) as any) as any
    expect(diagnostics.map((d: any) => d.code)).toEqual(['C001'])
  })

  test('R102: object unions, wherever they sit; `.nullable()` and scalars pass; the setting allows them', () => {
    const union = z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])
    const codes = (def: any, rust?: any) => (contract(new Map([entry('query', 'x.1', def)] as any), rust) as any).diagnostics.filter((d: any) => d.code === 'R102').map((d: any) => /'s `([^`]+)` is a plain/.exec(d.why)[1])
    expect(codes({ output: union })).toEqual(['output'])
    expect(codes({ output: z.null(), input: z.object({ a: z.array(union) }) })).toEqual(['input.a'])
    expect(codes({ output: z.null(), errors: { E: union } })).toEqual(['error E'])
    expect(codes({ output: z.object({ a: z.string() }).nullable() })).toEqual([])
    expect(codes({ output: z.union([z.string(), z.number()]) })).toEqual([])
    expect(codes({ output: z.discriminatedUnion('k', [z.object({ k: z.literal('a') }), z.object({ k: z.literal('b') })]) })).toEqual([])
    expect(codes({ output: union }, { unions: 'allow' })).toEqual([])
  })
})

describe('cargo\'s messages', () => {
  const contractOf = { functions: [{ id: 'searchDocs.abc123', name: 'searchDocs', impl: { service: 'search' } }, { id: 'other.abc123', name: 'other', impl: { service: 'elsewhere' } }] }
  const message = (code: string, text: string, file = 'src/main.rs', line = 9) => JSON.stringify({ reason: 'compiler-message', message: { level: 'error', code: { code }, message: text, rendered: `error: ${text}`, spans: [{ is_primary: true, file_name: file, line_start: line, column_start: 2, line_end: line, column_end: 5 }] } })
  const read = (lines: string[]) => readCargo(lines.join('\n'), { contract: contractOf, service: 'search', root: '/app', dir: '/app/crates/search' })

  test('an error that names a function\'s types or method is R103, with its id and place', () => {
    const { diagnostics } = read([message('E0063', 'missing field `lang` in initializer of `SearchDocsOutputItem`'), message('E0046', 'not all trait items implemented, missing: `search_docs`')])
    expect(diagnostics.map(d => [d.code, (d as any).function, d.file, d.span[0]])).toEqual([['R103', 'searchDocs.abc123', 'crates/search/src/main.rs', 9], ['R103', 'searchDocs.abc123', 'crates/search/src/main.rs', 9]])
  })

  test('any other error is R109, and another service\'s function isn\'t this one\'s', () => {
    const { diagnostics } = read([message('E0412', 'cannot find type `strr` in this scope'), message('E0599', 'no method `other` found')])
    expect(diagnostics.map(d => d.code)).toEqual(['R109', 'R109'])
  })

  test('a build gives the binary; warnings and the summary line are not errors', () => {
    const r = read([
      JSON.stringify({ reason: 'compiler-artifact', executable: '/x/target/debug/build-script-build', target: { kind: ['custom-build'] } }),
      JSON.stringify({ reason: 'compiler-artifact', executable: '/x/target/debug/search', target: { kind: ['bin'] } }),
      JSON.stringify({ reason: 'compiler-message', message: { level: 'warning', message: 'unused', spans: [] } }),
      JSON.stringify({ reason: 'compiler-message', message: { level: 'error', message: 'aborting due to 1 previous error', code: null, spans: [] } }),
      JSON.stringify({ reason: 'build-finished', success: true }),
      'not json',
    ])
    expect(r).toMatchObject({ ok: true, exe: '/x/target/debug/search', diagnostics: [] })
  })
})
