// Server functions and the client data cache (research 27). `query`/`mutation` definitions live in server modules
// (`src/server/**`, `*.server.ts`); the `weft:start` plugin gives each an id and, for the client, strips everything
// but `optimistic`. One definition is then:
//
//   - on the server: `q.fetch(input)` runs `run` through the request cache (exec.ts), at most once per request;
//   - in a component or scope: `q(input)` is a `Query` (a Resource) reading the client cache. Its fetcher reads the
//     entry's value, so a new server value or an optimistic layer updates every reader in place;
//   - a mutation `m(input)` POSTs, applies `optimistic` layers at once, and settles with the refreshed queries the
//     server sends back in the same response (single-flight).
//
// The cache entry's value is `base` with each pending layer applied. New bases are structurally shared with the old
// one, so unchanged rows keep their identity and `For` keeps them. This module ships to the client; the executor
// (exec.ts) is the server's, and the in-process fake transport weft/test turns on loads it on demand.

import { DEV, createRoot, derived, getOwner, onCleanup, resource, state, untrack, type Derived, type Resource, type State } from 'weft'
import { client } from './router'

// ---- definitions ------------------------------------------------------------------------------------------------

/** The Standard Schema interface (standardschema.dev): Zod, Valibot, ArkType and Drizzle's derived schemas. */
export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => SchemaResult<O> | Promise<SchemaResult<O>>
    readonly types?: { readonly input: I; readonly output: O }
  }
}
export type SchemaResult<O> = { readonly value: O; readonly issues?: undefined } | { readonly issues: readonly SchemaIssue[] }
export interface SchemaIssue { readonly message: string; readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] }

/**
 * What `run` and `load` get. Augment it with what `src/context.server.ts` returns:
 * `declare module '@weft/start' { interface Context { db: Db; user: User | null } }`.
 */
export interface Context {
  request: Request
  /** Headers merged into the response (cookies a sign-in sets). */
  response: { headers: Headers }
}

/** The address the server saw (never one a client sent): Better Auth's rate limits key on it. */
export const CLIENT_IP = 'x-weft-client-ip'

/** `'minutes'` etc. or seconds: how long the shared server cache keeps a value (research 27 §4). */
export type Life = 'seconds' | 'minutes' | 'hours' | 'days' | 'max' | number

/** `auth: 'user'` narrows `ctx.user` to non-null in `run` (A002 answers a call with no session). */
export type AuthScope = 'user'
type Ctx<A> = A extends 'user' ? (Context extends { user: infer U } ? Omit<Context, 'user'> & { user: NonNullable<U> } : Context) : Context

type In<S> = S extends StandardSchemaV1<infer I, any> ? I : void
type Out<S> = S extends StandardSchemaV1<any, infer O> ? O : undefined
type Tags<A extends any[]> = readonly string[] | ((...args: A) => readonly string[])

export interface QueryDef<S, O, A = undefined> {
  input?: S
  /** The result's shape: checked in dev and tests (C002), and the contract's `output`. */
  output?: StandardSchemaV1
  /** `'user'`: refuse a call with no session (A002). The contract's auth scope. */
  auth?: A
  /** What invalidates it: the client cache, the request cache and the shared cache all go by these. */
  tags?: Tags<[input: Out<S>]>
  /** Turn on the shared server cache (across requests). Omit it and the query runs once per request. */
  cache?: { life?: Life; /** One cached value per signed-in user: `ctx.user` is readable. */ scope?: 'user' }
  run: (args: { input: Out<S>; ctx: Ctx<A> }) => O | Promise<O>
  /** Set by the `weft:start` plugin: `<export>.<file hash>`. */
  $id?: string
}

export interface MutationDef<S, O, A = undefined> {
  input?: S
  output?: StandardSchemaV1
  auth?: A
  /** Tags whose queries the response refreshes (single-flight) and whose cached values it drops. */
  invalidates?: Tags<[input: Out<S>, result: Awaited<O>]>
  /** Client only: predict the result. Each call's layers are re-applied on new values until it settles. */
  optimistic?: (args: { input: In<S> }, cache: OptimisticCache) => void
  run: (args: { input: Out<S>; ctx: Ctx<A> }) => O | Promise<O>
  $id?: string
}

/** The typed "no query" input: `getTodo(() => (id.value ? { id: id.value } : skip))`. */
export const skip: unique symbol = Symbol.for('weft.skip') as any
export type Skip = typeof skip

type Arg<I> = I | (() => I | Skip)

export interface Query<I, O> {
  /** The live value, read in a component or a defineState setup (Q001 elsewhere: use `fetch`). */
  (...args: [I] extends [void] ? [input?: undefined | (() => undefined | Skip)] : [input: Arg<I>]): Resource<O>
  /** The value as a promise: in `load`, handlers, server code and tests. Through the request or client cache. */
  fetch(...args: [I] extends [void] ? [] : [input: I]): Promise<O>
  readonly kind: 'query'
  readonly $id: string
}

export interface Mutation<I, O> {
  (...args: [I] extends [void] ? [] : [input: I]): Promise<O>
  /** A call is in flight. */
  readonly pending: Derived<boolean>
  /** The last call's failure, until the next call succeeds. */
  readonly error: Derived<unknown>
  readonly kind: 'mutation'
  readonly $id: string
}

/** Any definition, as the executor and transports see it. */
export interface Fn {
  kind: 'query' | 'mutation'
  $id: string
  def: { input?: StandardSchemaV1; output?: StandardSchemaV1; auth?: AuthScope; run?: (args: any) => unknown; tags?: Tags<any[]>; cache?: { life?: Life; scope?: 'user' }; invalidates?: Tags<any[]>; optimistic?: (args: any, cache: OptimisticCache) => void }
}

/** Every definition by id (the server answers `/_weft/fn/<id>` from it). */
export const fns = new Map<string, Fn>()
let auto = 0

// ---- errors and redirects -----------------------------------------------------------------------------------

/** A diagnostic thrown by @weft/start: `code` (Q001…) and a fix in the message, like weft's StateError. */
export class StartError extends Error {
  constructor(public code: string, message: string, fix?: string, public extra: Record<string, unknown> = {}) {
    super(`${code}: ${message}${fix ? `\n  fix: ${fix}` : ''}`)
    Object.assign(this, extra)
  }
}

/** A failed server function call, as the client sees it. */
export class FnError extends Error {
  code?: string
  status: number
  issues?: SchemaIssue[]
  constructor(e: { message?: string; code?: string; issues?: SchemaIssue[] }, status: number) {
    super(e.message ?? `server function failed (${status})`)
    this.status = status
    Object.assign(this, { code: e.code, issues: e.issues })
  }
}

declare const redirectBrand: unique symbol
export interface Redirect {
  readonly isRedirect: true
  readonly href: string
  readonly status: number
  readonly [redirectBrand]?: true
}

/**
 * Send the request elsewhere: in `load` (a page answers 307 with `location`, client navigation follows) or in a
 * `run` (the client router navigates). It throws, so `(await db.get(id)) ?? redirect('/todos')` types as the row.
 */
export function redirect(href: string, status: 301 | 302 | 303 | 307 | 308 = 307): never {
  throw { isRedirect: true, href, status } as Redirect
}

export const isRedirect = (v: unknown): v is Redirect => !!v && typeof v === 'object' && (v as any).isRedirect === true

// ---- keys -------------------------------------------------------------------------------------------------------

/** JSON with sorted object keys: the same input gives the same key on both sides (no input: `''`; JSON sends null). */
export function stable(v: unknown): string {
  if (v == null) return ''
  return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x))
}

export const keyOf = (id: string, input: unknown) => `${id}:${stable(input)}`

// ---- runtime hooks ------------------------------------------------------------------------------------------------

/** One cached entry as the server sends it: `[id, input, value, tags]` (page payload, navigation, refreshes). */
export type Wire = [id: string, input: unknown, value: unknown, tags: string[]]

/** What the transports answer (research 27 §3). */
export interface Answer { v?: unknown; t?: string[]; c?: Wire[]; r?: string; /** `r` is a full load: the session changed, so nothing cached may survive. */ x?: 1 }

export interface Transport {
  query(id: string, input: unknown): Promise<Answer>
  mutate(id: string, input: unknown, refresh: [string, unknown][]): Promise<Answer>
}

/**
 * Set by the server half (server.tsx): the request in progress and the executor. `navigate` overrides the client
 * router's (tests). Unset in plain tests.
 */
export const runtime: {
  scope?: () => any
  /** Run `fn` with `scope` current (the request's AsyncLocalStorage). */
  enter?: <T>(scope: any, fn: () => T) => T
  exec?: typeof import('./exec')
  transport?: Transport
  navigate?: (href: string, replace?: boolean) => void
  /** The databases `createDb` made: the server applies migrations to them before the first request. */
  dbs?: Set<{ $weft: { migrate(list: { tag: string; sql: string }[]): Promise<void> } }>
} = {}

const go = (href: string, replace?: boolean) => (runtime.navigate ? runtime.navigate(href, replace) : void client.navigate?.(href, { replace }))

/** weft/test's controls, when it's loaded; the first look registers the cache reset it runs after each test. */
let registered = false
const net = () => {
  const n = (globalThis as any)[Symbol.for('weft.net')] as NetControl | undefined
  if (n && !registered) {
    registered = true
    n.resets.push(() => {
      cache.clear()
      callId = 0
    })
  }
  return n
}

/** weft/test's fake-transport controls (research 27 §7). */
export interface NetControl {
  latency: number
  ctx?: object
  online(): boolean
  fails: Map<string, unknown[]>
  handlers: Map<string, (input: any, ctx: any) => unknown>
  log: { id: string; kind: string; input: unknown }[]
  inflight: Set<Promise<unknown>>
  als: { run<T>(store: unknown, fn: () => T): T; getStore(): unknown }
  resets: (() => void)[]
}

// ---- definitions --------------------------------------------------------------------------------------------------

export function query<O, S extends StandardSchemaV1 | undefined = undefined, const A extends AuthScope | undefined = undefined>(def: QueryDef<S, O, A>): Query<In<S>, Awaited<O>> {
  const id = def.$id ?? `q${++auto}`
  const fn: Fn = { kind: 'query', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  const q: any = (input?: unknown) => use(fn, input)
  q.fetch = (input?: unknown) => fetchQuery(fn, input)
  return Object.assign(q, { kind: 'query', $id: id, [FN]: fn })
}

export function mutation<O, S extends StandardSchemaV1 | undefined = undefined, const A extends AuthScope | undefined = undefined>(def: MutationDef<S, O, A>): Mutation<In<S>, Awaited<O>> {
  const id = def.$id ?? `m${++auto}`
  const fn: Fn = { kind: 'mutation', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  // Module-level boxes, read on the client only (a server render never shows a call in flight).
  const { calls, error } = createRoot(() => ({ calls: state(0), error: state<unknown>(undefined) }), null)
  const pending = createRoot(() => derived(() => calls.value > 0), null)
  const m: any = (input?: unknown) => mutate(fn, input, calls, error)
  return Object.assign(m, { kind: 'mutation', $id: id, pending, error: { get value() { return error.value } }, [FN]: fn })
}

const FN = Symbol.for('weft.fn')
/** The definition behind a query or mutation handle (also accepts the definition). */
export const fnOf = (h: any): Fn => h?.[FN] ?? h

// ---- server and client calls ---------------------------------------------------------------------------------

const server = () => runtime.scope?.() ?? net()?.als.getStore()
/** The request scope in progress, on the server or under the fake transport. */
export const currentScope = server
/** Run `fn` with `scope` current. */
export const enter = <T>(scope: unknown, fn: () => T): T => (runtime.enter ? runtime.enter(scope, fn) : net() ? net()!.als.run(scope, fn) : fn())

function fetchQuery(fn: Fn, input: unknown): Promise<any> {
  const scope = server()
  if (scope) return runtime.exec!.fetchQuery(scope, fn, input).then(e => e.v)
  if (runtime.exec && !net()) return runtime.exec.fetchQuery(runtime.exec.createScope(new Request('http://localhost/')), fn, input).then(e => e.v)
  const e = entry(fn, input)
  return untrack(() => fresh(e)) ? Promise.resolve(untrack(() => e.value.value)) : load(e)
}

function use(fn: Fn, input: unknown): Resource<any> {
  if (!getOwner())
    throw DEV ? new StartError('Q001', `\`${fn.$id}()\` (a live query) was called outside a component or scope`, `\`await ${name(fn)}.fetch(input)\` in \`load\`, handlers and server code`) : new StartError('Q001', fn.$id)
  const read = () => (typeof input === 'function' ? (input as () => unknown)() : input)
  return resource(() => {
    const arg = read()
    if (arg === skip) return undefined as any
    const scope = server()
    if (scope) return runtime.exec!.readQuery(scope, fn, arg)
    const e = entry(fn, arg)
    e.readers++
    onCleanup(() => void e.readers--)
    const v = e.value.value // tracked: a new base or layer re-runs this, and the resource settles to it in place
    if (fresh(e)) return v
    return load(e)
  }, { data: false })
}

const name = (fn: Fn) => fn.$id.replace(/\..*$/, '')

// ---- the client cache -----------------------------------------------------------------------------------------

interface Layer { m: number; apply: (draft: any) => any; waiting?: boolean }
interface Entry {
  key: string
  id: string
  input: unknown
  base: State<unknown>
  has: State<boolean>
  stale: State<boolean>
  layers: State<Layer[]>
  value: Derived<any>
  tags: string[]
  readers: number
  p?: Promise<unknown>
}

const entries = new Map<string, Entry>()
/** Objects an optimistic layer made (`cache.isOptimistic(row)`). */
let made = new WeakSet<object>()

function entry(fn: Fn, input: unknown): Entry {
  if (!registered) net()
  const key = keyOf(fn.$id, input)
  let e = entries.get(key)
  if (!e) {
    // Owned by no component: the entry outlives its readers (the next reader finds it seeded).
    e = createRoot(() => {
      const base = state<unknown>(undefined), has = state(false), stale = state(false), layers = state<Layer[]>([])
      const value = derived(() => {
        let v = base.value
        if (!has.value) return v
        for (const l of layers.value) v = produce(v, l.apply)
        return v
      })
      return { key, id: fn.$id, input, base, has, stale, layers, value, tags: [], readers: 0 }
    }, null)
    entries.set(key, e)
  }
  return e
}

const fresh = (e: Entry) => e.has.value && !e.stale.value

function load(e: Entry): Promise<unknown> {
  return (e.p ??= transport().query(e.id, e.input).then(
    a => {
      e.p = undefined
      if (a.r !== undefined) {
        go(a.r, true)
        throw { isRedirect: true, href: a.r, status: 307 }
      }
      setBase(e, a.v, a.t ?? [])
      return untrack(() => e.value.value)
    },
    err => {
      e.p = undefined
      throw err
    },
  ))
}

/** A server value lands: shared with the old base, layers of settled calls dropped, readers updated in place. */
function setBase(e: Entry, v: unknown, tags: string[]) {
  untrack(() => {
    e.tags = tags
    e.base.value = share(e.base.value, v)
    e.has.value = true
    e.stale.value = false
    if (e.layers.value.some(l => l.waiting)) e.layers.value = e.layers.value.filter(l => !l.waiting)
  })
}

/** Seed the cache from the server (the page's `#weft-cache`, a navigation's `c`, a mutation's refreshes). */
export function seed(list: Wire[] | null | undefined) {
  for (const [id, input, v, tags] of list ?? []) setBase(entry(fns.get(id) ?? ({ $id: id } as Fn), input), v, tags)
}


/** Mark entries with any of `tags` stale: entries with readers refetch now, the rest on their next read. */
function staleTags(tags: string[], except: Set<string> = new Set()) {
  if (!tags.length) return
  untrack(() => {
    for (const e of entries.values()) if (!except.has(e.key) && e.tags.some(t => tags.includes(t))) e.stale.value = true
  })
  client.invalidated?.(tags)
}

async function mutate(fn: Fn, input: unknown, calls: State<number>, error: State<unknown>): Promise<unknown> {
  const scope = server()
  if (scope) return (await runtime.exec!.runMutation(scope, fn, input, [])).v
  const m = ++callId
  const touched = new Set<Entry>()
  untrack(() => calls.value++)
  if (fn.def.optimistic) untrack(() => fn.def.optimistic!({ input }, overlay(m, touched)))
  const refresh = [...entries.values()].filter(e => e.readers > 0).map(e => [e.id, e.input] as [string, unknown])
  const drop = (e: Entry) => { e.layers.value = e.layers.value.filter(l => l.m !== m) }
  try {
    const a = await transport().mutate(fn.$id, input, refresh)
    let out: unknown
    untrack(() => {
      const refreshed = new Set<string>()
      for (const w of a.c ?? []) {
        const e = entry(fns.get(w[0]) ?? ({ $id: w[0] } as Fn), w[1])
        setBase(e, w[2], w[3])
        refreshed.add(e.key)
      }
      for (const e of touched) {
        if (refreshed.has(e.key)) drop(e)
        else {
          // S011: the server sent no fresh value for an entry this call predicted. Keep the layer until the entry's
          // next value (refetched now) instead of flashing back to the old one.
          if (DEV && !e.tags.some(t => a.t?.includes(t)))
            console.warn(`weft: S011 \`${fn.$id}\`'s optimistic updated \`${e.key}\` (tags ${JSON.stringify(e.tags)}), but its invalidated tags ${JSON.stringify(a.t ?? [])} don't cover it: the prediction had no fresh value to land on.\n  fix: add one of its tags to \`invalidates\``)
          e.layers.value = e.layers.value.map(l => (l.m === m ? { ...l, waiting: true } : l))
          e.stale.value = true
          if (!e.readers) load(e).catch(() => {})
        }
      }
      staleTags(a.t ?? [], refreshed)
      error.value = undefined
      out = a.v
    })
    if (a.r !== undefined) a.x ? location.assign(a.r) : go(a.r)
    return out
  } catch (err) {
    untrack(() => {
      for (const e of touched) drop(e) // only this call's prediction goes
      error.value = err
    })
    throw err
  } finally {
    untrack(() => calls.value--)
  }
}
let callId = 0

/** The `cache` an `optimistic` gets: `update` and `set` add this call's layers instead of writing the base. */
function overlay(m: number, touched: Set<Entry>): OptimisticCache {
  const push = (q: any, input: unknown, apply: Layer['apply']) => {
    const e = entry(fnOf(q), input)
    touched.add(e)
    e.layers.value = [...e.layers.value, { m, apply }]
  }
  return {
    ...cache,
    update: (q, input, recipe) => push(q, input, recipe),
    set: (q, input, value) => push(q, input, () => value),
  }
}

export interface OptimisticCache {
  /** Change a query's cached value with a draft (copy-on-write: untouched rows keep their identity). */
  update<O>(q: Query<any, O>, input: unknown, recipe: (draft: O) => O | void): void
  set<O>(q: Query<any, O>, input: unknown, value: O): void
  get<O>(q: Query<any, O>, input?: unknown): O | undefined
  /** The value (a row) was made by a pending optimistic layer. */
  isOptimistic(value: unknown): boolean
}

/**
 * The client cache. In `optimistic`, `update`/`set` add layers; elsewhere they write the base (until the next server
 * value). `invalidate` marks tags stale (readers refetch).
 */
export const cache: OptimisticCache & { invalidate(...tags: string[]): void; clear(): void } = {
  update(q, input, recipe) {
    const e = entry(fnOf(q), input)
    if (untrack(() => e.has.value)) setBase(e, produce(untrack(() => e.base.value), recipe as any), e.tags)
  },
  set(q, input, value) {
    const e = entry(fnOf(q), input)
    setBase(e, value, e.tags)
  },
  get(q, input) {
    const e = entries.get(keyOf(fnOf(q).$id, input))
    return e && untrack(() => e.value.value)
  },
  isOptimistic: v => !!v && typeof v === 'object' && made.has(v),
  invalidate(...tags) {
    const scope = server()
    if (scope) return runtime.exec!.invalidate(scope, tags)
    staleTags(tags)
  },
  clear() {
    entries.clear()
    made = new WeakSet()
  },
}

/** Server: drop `tags` for this response and the shared cache. Client: refetch what reads them. */
export const invalidate = (...tags: string[]) => cache.invalidate(...tags)

// ---- transports ---------------------------------------------------------------------------------------------------

function transport(): Transport {
  if (runtime.transport) return runtime.transport
  if (net()) return inProcess
  return http
}

const answer = async (res: Response): Promise<Answer> => {
  const body = await res.json().catch(() => ({ e: { message: `server function answered ${res.status}` } }))
  if (body.e) throw new FnError(body.e, res.status)
  return body
}

/** The browser's: GET for queries, POST + JSON + `x-weft` for mutations (research 27 §3). */
export const http: Transport = {
  query: (id, input) => fetch(`/_weft/fn/${id}${input === undefined ? '' : `?i=${encodeURIComponent(stable(input))}`}`, { headers: { accept: 'application/json' } }).then(answer),
  mutate: (id, input, f) =>
    fetch(`/_weft/fn/${id}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-weft': '1' }, body: JSON.stringify({ i: input, f }) }).then(answer),
}

/**
 * weft/test's fake transport: the server's executor in process, with the controls weft/test's `net` sets (latency,
 * failures, replaced functions, offline), and a JSON round trip both ways so values arrive as they would over HTTP.
 */
const inProcess: Transport = {
  query: (id, input) => fake(id, 'query', input, (exec, scope, fn) => exec.fetchQuery(scope, fn, input).then(e => ({ v: e.v, t: e.tags }))),
  mutate: (id, input, f) => fake(id, 'mutation', input, (exec, scope, fn) => exec.runMutation(scope, fn, input, f)),
}

function fake(id: string, kind: string, input: unknown, call: (exec: typeof import('./exec'), scope: any, fn: Fn) => Promise<Answer>): Promise<Answer> {
  const n = net()!
  const p = fakeCall(n, id, kind, input, call)
  n.inflight.add(p)
  const done = () => void n.inflight.delete(p)
  p.then(done, done)
  return p
}

async function fakeCall(n: NetControl, id: string, kind: string, input: unknown, call: (exec: typeof import('./exec'), scope: any, fn: Fn) => Promise<Answer>): Promise<Answer> {
  n.log.push({ id, kind, input })
  const exec = (runtime.exec ??= await import('./exec'))
  if (n.latency) await new Promise(ok => setTimeout(ok, n.latency))
  if (!n.online()) throw Object.assign(new Error(`offline: ${id} wasn't sent`), { name: 'OfflineError' })
  const fails = n.fails.get(id)
  if (fails?.length) throw fails.shift()
  const fn = fns.get(id)
  if (!fn) throw new FnError({ code: 'Q009', message: `Q009: no server function \`${id}\`` }, 404)
  const scope = exec.createScope(new Request(`http://localhost/_weft/fn/${id}`, { method: kind === 'query' ? 'GET' : 'POST' }), { context: () => n.ctx ?? {}, handlers: n.handlers, dev: true, onDiagnostic: d => console.warn(`weft: ${d.message.startsWith(d.code) ? '' : d.code + ' '}${d.message}`) })
  try {
    return JSON.parse(JSON.stringify(await n.als.run(scope, () => call(exec, scope, fn))))
  } catch (e) {
    if (isRedirect(e)) return { r: e.href }
    throw e instanceof StartError ? new FnError({ code: e.code, message: e.message, issues: (e as any).issues }, (e as any).status ?? 500) : e
  }
}

// ---- structural sharing and drafts ------------------------------------------------------------------------------

const plain = (v: unknown): v is Record<PropertyKey, any> =>
  !!v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)

/** `next`, with every subtree deep-equal to `prev`'s replaced by `prev`'s (TanStack's replaceEqualDeep). */
export function share<T>(prev: unknown, next: T): T {
  if (prev === next || !plain(prev) || !plain(next) || Array.isArray(prev) !== Array.isArray(next)) return next
  const keys = Object.keys(next)
  let same = Object.keys(prev).length === keys.length
  const out: any = Array.isArray(next) ? [] : {}
  for (const k of keys) {
    out[k] = share((prev as any)[k], (next as any)[k])
    if (out[k] !== (prev as any)[k]) same = false
  }
  return same ? (prev as T) : out
}

interface Draft { b: any; c?: any; px: any; done?: any }

/**
 * Run `recipe` on a copy-on-write draft of `base`: only objects it writes (and their parents) are copied. A recipe
 * may instead return a new value. The copies are remembered for `cache.isOptimistic`.
 */
export function produce<T>(base: T, recipe: (draft: T) => T | void): T {
  if (!plain(base)) {
    const r = recipe(base)
    return r === undefined ? base : r
  }
  const nodes = new Map<object, Draft>()
  const byProxy = new WeakMap<object, Draft>()
  const unwrap = (v: any) => (v && typeof v === 'object' && byProxy.has(v) ? byProxy.get(v)!.b : v)
  const cur = (n: Draft) => n.c ?? n.b
  const own = (n: Draft) => (n.c ??= Array.isArray(n.b) ? n.b.slice() : { ...n.b })
  const node = (b: any): Draft => {
    let n = nodes.get(b)
    if (n) return n
    n = { b, px: undefined }
    const self = n
    n.px = new Proxy(Array.isArray(b) ? [] : {}, {
      get: (_, k) => {
        const v = cur(self)[k]
        return plain(v) ? node(v).px : v
      },
      set: (_, k, v) => {
        v = unwrap(v)
        if (plain(v) && !nodes.has(v)) made.add(v) // a new object (a pushed row) is optimistic too
        own(self)[k] = v
        return true
      },
      deleteProperty: (_, k) => (delete own(self)[k], true),
      has: (_, k) => k in cur(self),
      ownKeys: () => Reflect.ownKeys(cur(self)),
      getOwnPropertyDescriptor: (t, k) => {
        const d = Reflect.getOwnPropertyDescriptor(cur(self), k)
        if (d && k === 'length' && Array.isArray(t)) return { ...d, configurable: false }
        return d && { ...d, configurable: true, value: (self.px as any)[k] }
      },
    })
    nodes.set(b, n)
    byProxy.set(n.px, n)
    return n
  }
  // The result: copies where something changed, the original objects everywhere else.
  const fin = (n: Draft): any => {
    if (n.done !== undefined) return n.done
    n.done = n.b // cycles stop here
    const src = cur(n)
    let out = n.c
    for (const k of Object.keys(src)) {
      const v = src[k]
      if (!plain(v) || !nodes.has(v)) continue
      const f = fin(nodes.get(v)!)
      if (f !== v) (out ??= own(n))[k] = f
    }
    if (out) made.add(out)
    return (n.done = out ?? n.b)
  }
  const deep = (v: any): any => {
    if (v && typeof v === 'object' && byProxy.has(v)) return fin(byProxy.get(v)!)
    if (Array.isArray(v)) return v.map(deep)
    if (plain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    return v
  }
  const root = node(base)
  const r = recipe(root.px)
  return r === undefined || r === root.px ? fin(root) : deep(r)
}

// ---- start-up ----------------------------------------------------------------------------------------------------

// In the browser, as the first route chunk that uses a query loads (before hydration): the page's entries, and
// whatever a navigation brought before this module loaded.
if (typeof document !== 'undefined' && !runtime.scope) {
  client.seed = seed
  seed(client.seeds)
  client.seeds = undefined
  const el = document.getElementById('weft-cache')
  if (el) seed(JSON.parse(el.textContent!))
}
