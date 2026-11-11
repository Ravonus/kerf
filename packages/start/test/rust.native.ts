import { mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { fns, query, StartError, type Impl } from '../src/data'
import { fetchQuery, type createScope, type ScopeOptions } from '../src/exec'
import { describe as contract, nativeProblem } from '../src/contract.mjs'
import { readCargo } from '../src/sidecar.mjs'
import { native, remote, type Claims } from '../src/rust'

type Found = Parameters<NonNullable<ScopeOptions['onDiagnostic']>>[0]
type Envelope = { user: Claims | null; deadlineMs: number; iat: number; traceparent: string }
type NativeOptions = {
  scope: (options?: ScopeOptions, init?: RequestInit) => ReturnType<typeof createScope>
  fnOf: (q: { $id: string }) => NonNullable<ReturnType<typeof fns.get>>
  nextId: () => number
  seen: () => unknown[]
}

function nativeFixture({ scope, fnOf, nextId, seen }: NativeOptions) {
  const dlopen = process.dlopen.bind(process)
  let dir: string
  let addons: Record<
    string,
    { hash: string; call: (id: string, ctx: string, body: string) => unknown }
  >
  let calls: { id: string; ctx: Envelope; body: unknown }[]
  const manifest = (m: unknown) => {
    writeFileSync(join(dir, 'next.json'), JSON.stringify(m))
    renameSync(join(dir, 'next.json'), join(dir, 'manifest.json'))
  }
  const addon = (
    file: string,
    hash: string,
    call: (id: string, ctx: string, body: string) => unknown = () =>
      JSON.stringify({ ok: true, value: { n: 1 }, tags: [], touched: [] }),
  ) => {
    writeFileSync(join(dir, file), '')
    addons[join(dir, file)] = { hash, call }
  }
  const fn = (def: object = {}, impl: Impl = native('media')) =>
    fnOf(query({ $id: `n${nextId()}.abc123`, output: z.any(), ...def, impl }))
  const signedIn = (user: unknown) => scope({ context: () => ({ user }) })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'native-'))
    process.env.KERF_NATIVE_DIR = dir
    addons = {}
    calls = []
    process.dlopen = (mod: { exports: unknown }, file: string) => {
      const a = addons[file]
      if (!a) throw new Error(`no such addon: ${file}`)
      mod.exports = {
        contract: () => JSON.stringify({ hash: a.hash }),
        call: (id: string, ctx: string, body: string) => {
          calls.push({ id, ctx: JSON.parse(ctx), body: JSON.parse(body) })
          return Promise.resolve(a.call(id, ctx, body))
        },
      }
    }
  })
  afterEach(() => {
    process.dlopen = dlopen
    delete process.env.KERF_NATIVE_DIR
  })

  return {
    manifest,
    addon,
    fn,
    signedIn,
    scope,
    get dir() {
      return dir
    },
    get calls() {
      return calls
    },
    get seen() {
      return seen()
    },
  }
}

type NativeFixture = ReturnType<typeof nativeFixture>

function registerNativeWireTests(fixture: NativeFixture) {
  const { addon, manifest, fn, signedIn, scope } = fixture
  test('sends the wire input and the claims, no signature, and validates what comes back', async () => {
    addon('m.node', 'h')
    manifest({ media: { hash: 'h', addon: 'm.node' } })
    const f = fn({
      input: z.object({ at: z.string().trim() }),
      output: z.object({ n: z.number() }),
    })
    await expect(
      fetchQuery(signedIn({ id: 7, role: 'admin', secret: 'no' }), f, { at: ' x ' }).then(
        (r) => r.v,
      ),
    ).resolves.toEqual({ n: 1 })
    expect(fixture.calls[0]!.body).toEqual({ input: { at: 'x' } })
    expect(fixture.calls[0]!.ctx.user).toEqual({ id: '7', roles: ['admin'] })
    expect(fixture.calls[0]!.ctx.deadlineMs).toBe(10_000)
  })

  test('errors read as they do from a sidecar, and a panic stays in the log', async () => {
    const answers: unknown[] = [
      { ok: false, error: { code: 'Internal', requestId: 'r1', detail: 'panicked: boom' } },
      { ok: false, error: { code: 'Drift', message: 'x' } },
      { ok: false, error: { code: 'NotFound', data: { id: 'a' } } },
    ]
    addon('m.node', 'h', () => JSON.stringify(answers.shift()))
    manifest({ media: { hash: 'h', addon: 'm.node' } })
    const logged: string[] = []
    const error = console.error
    console.error = (m: string) => logged.push(m)
    const f = fn({ errors: { NotFound: z.object({ id: z.string() }) } })
    const run = () => fetchQuery(scope(), f, undefined)
    try {
      await expect(run()).rejects.toMatchObject({
        code: 'R108',
        status: 500,
        message: expect.not.stringContaining('boom'),
      })
      expect(logged[0]).toContain('panicked: boom')
      await expect(run()).rejects.toMatchObject({ code: 'R103', status: 502 })
      await expect(run()).rejects.toMatchObject({ code: 'NotFound', data: { id: 'a' } })
    } finally {
      console.error = error
    }
  })

  test('R107: past `timeout`, TS stops waiting', async () => {
    addon('m.node', 'h', () => new Promise(() => {}))
    manifest({ media: { hash: 'h', addon: 'm.node' } })
    const f = fn({}, native('media', { timeout: 20 }))
    await expect(fetchQuery(scope(), f, undefined)).rejects.toMatchObject({
      code: 'R107',
      status: 504,
    })
  })
}

function registerNativeLoadingTests(fixture: NativeFixture) {
  const { addon, manifest, fn, scope } = fixture
  test('R103: a library from another contract', async () => {
    addon('m.node', 'old')
    manifest({ media: { hash: 'new', addon: 'm.node' } })
    await expect(native('media').engine()).rejects.toMatchObject({
      code: 'R103',
      message: expect.stringContaining('old'),
    })
  })

  test('R104: nothing to load, and an addon that fails with no WASM behind it', async () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      manifest({})
      await expect(native('media').engine()).rejects.toMatchObject({ code: 'R104' })
      manifest({ media: { hash: 'h', addon: 'gone.node' } })
      await expect(native('media').engine()).rejects.toMatchObject({ code: 'R104', status: 503 })
      writeFileSync(join(fixture.dir, 'broken.node'), '')
      manifest({ media: { hash: 'h', addon: 'broken.node' } })
      await expect(native('media').engine()).rejects.toMatchObject({ code: 'R104' })
    } finally {
      console.warn = warn
    }
    expect(() => native('Not A Name')).toThrow(StartError)
  })

  test('dev: a new manifest loads the new file, and a failed build keeps what was serving', async () => {
    const reply = (v: number) => () =>
      JSON.stringify({ ok: true, value: { n: v }, tags: [], touched: [] })
    addon('m-1.node', 'h', reply(1))
    addon('m-2.node', 'h', reply(2))
    manifest({ media: { hash: 'h', addon: 'm-1.node' } })
    const f = fn()
    const run = () => fetchQuery(scope(), f, undefined).then((r) => r.v)
    expect(await run()).toEqual({ n: 1 })
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
    manifest({ media: { hash: 'h', addon: 'm-2.node' } })
    expect(await run()).toEqual({ n: 2 })
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
    manifest({ media: { hash: 'other', addon: 'm-1.node' } })
    expect(await run()).toEqual({ n: 2 })
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
    manifest({ media: { hash: '', failure: 'it broke' } })
    await expect(run()).rejects.toMatchObject({
      code: 'R103',
      message: expect.stringContaining('it broke'),
    })
  })
}

function registerNativeContractTests(fixture: NativeFixture) {
  const { addon, manifest, fn, scope } = fixture
  test('the contract says which kind a service is, and one name is never both', () => {
    fns.clear()
    query({ $id: 'a.x', output: z.null(), impl: native('media') } as never)
    expect(contract(fns).services).toMatchObject({ media: { kind: 'native' } })
    query({ $id: 'b.x', output: z.null(), impl: remote('rust://media') } as never)
    expect(contract(fns).diagnostics).toEqual([
      expect.objectContaining({ code: 'R109', why: expect.stringContaining('both') }),
    ])
  })

  test('R104 from a preset', () => {
    expect(nativeProblem({ service: 'media', preset: 'cloudflare_module' } as never)).toContain(
      'remote(',
    )
    expect(nativeProblem({ service: 'media', preset: 'vercel', wasm: false })).toContain(
      'wasm: false',
    )
    expect(nativeProblem({ service: 'media', preset: 'vercel' } as never)).toBeUndefined()
    expect(nativeProblem({ service: 'media', preset: 'node', wasm: false })).toBeUndefined()
  })

  test('readCargo finds the library', () => {
    const line = JSON.stringify({
      reason: 'compiler-artifact',
      target: { kind: ['cdylib'] },
      filenames: ['/t/libmedia.d', '/t/libmedia.dylib'],
    })
    expect(readCargo(line, { service: 'media', root: '/', dir: '/' } as never).lib).toBe(
      '/t/libmedia.dylib',
    )
  })

  test('R105: a cached Rust query with tags that reported no table, once', async () => {
    addon('m.node', 'h')
    manifest({ media: { hash: 'h', addon: 'm.node' } })
    const found: Found[] = []
    const make = () => scope({ dev: true, onDiagnostic: (d) => found.push(d) })
    const f = fn({ tags: ['docs'], cache: { life: 'seconds' } })
    await fetchQuery(make(), f, undefined)
    await fetchQuery(make(), f, { again: 1 })
    expect(found.filter((d) => d.code === 'R105')).toHaveLength(1)
    fixture.seen.length = 0
    const pure = fn({ cache: { life: 'seconds' } })
    await fetchQuery(make(), pure, undefined)
    expect(fixture.seen).toEqual([])
  })
}

// `native()` with `process.dlopen` stood in for: what crosses, and what a build's manifest decides. The real addon and
// its WASM are covered by evals/gates/phase5b-exit.mjs.
export function registerNativeTests(options: NativeOptions) {
  describe('native()', () => {
    const fixture = nativeFixture(options)
    registerNativeWireTests(fixture)
    registerNativeLoadingTests(fixture)
    registerNativeContractTests(fixture)
  })
}
