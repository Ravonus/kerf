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
// (exec.ts) is the server's, and the in-process fake transport @weft-js/core/test turns on loads it on demand. Realtime
// (research 30) costs a query app one method here: `q.live()` imports live.ts on its first call.

import {
  DEV,
  createRoot,
  derived,
  effect,
  flush,
  getOwner,
  onCleanup,
  resource,
  state,
  untrack,
  type Derived,
  type Resource,
  type State,
} from '@weft-js/core'
import { fill, mask } from '@weft-js/core/shape'
import { client, peers } from './router'
import type { MediaAsset } from '@weft-js/core/media'
import type * as Exec from './exec'
import type { Scope } from './exec'
import type { ServerExtension } from './extension'

// ---- definitions ------------------------------------------------------------------------------------------------

/** Here and not in verify.ts: that file needs `postgres`, and an app without it still reads this type. */
export interface VerifyOptions {
  /** `true` or a target's name, as `verify: true` and `verify: 'staging'` mean, for when the rest of this is needed too. */
  target?: true | string
  /** A running staging app. Fine in code. */
  url?: string
  /** A database, from the environment: `process.env.STAGING_DATABASE_URL`. */
  db?: string
  /** The query's input. */
  input?: unknown
  /** Columns of the test row: whose it is, so the signed-in test user can see it. The rest are made up. */
  row?: Record<string, unknown>
  /** Name of the env var with a cookie for a user who can see the row. Default `WEFT_STAGING_COOKIE`. */
  cookie?: string
  /** Name of the env var with a cookie for a user who can't. Default `WEFT_STAGING_OTHER_COOKIE`; without it, a signed-out client. */
  otherCookie?: string
  /** Ms each link may take. Default 5000. */
  timeout?: number
}

/** The Standard Schema interface (standardschema.dev): Zod, Valibot, ArkType and Drizzle's derived schemas. */
export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => SchemaResult<O> | Promise<SchemaResult<O>>
    readonly types?: { readonly input: I; readonly output: O } | undefined
  }
}
/** What a Standard Schema validator answers. */
export type SchemaResult<O> =
  | { readonly value: O; readonly issues?: undefined }
  | { readonly issues: readonly SchemaIssue[] }
/** One failure from a schema, with the path to the field when there is one. */
export interface SchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

/**
 * What `run` and `load` get. Augment it with what `src/context.server.ts` returns:
 * `declare module '@weft-js/start' { interface Context { db: Db; user: User | null } }`.
 */
export interface Context {
  request: Request
  /** Headers merged into the response (cookies a sign-in sets). */
  response: { headers: Headers }
  /** Uploads and CMS images (research 29 §6): `ingest` stores the original and returns the record `z.media()` validates. */
  media: { ingest(file: Blob | Uint8Array, options?: { name?: string }): Promise<MediaAsset> }
}

/** The address the server saw (never one a client sent): Better Auth's rate limits key on it. */
export const CLIENT_IP = 'x-weft-client-ip'

/** Options a plugin adds to `query` and `mutation`, by augmenting this; its extension's `guard` reads them. Empty here. */
export interface FnOptions {}

/** `'minutes'` etc. or seconds: how long the shared server cache keeps a value (research 27 §4). */
export type Life = 'seconds' | 'minutes' | 'hours' | 'days' | 'max' | number

/** `auth: 'user'` narrows `ctx.user` to non-null in `run` (A002 answers a call with no session). */
export type AuthScope = 'user'
type Ctx<A> = A extends 'user'
  ? Context extends { user: infer U }
    ? Omit<Context, 'user'> & { user: NonNullable<U> }
    : Context
  : Context

type In<S> = S extends StandardSchemaV1<infer I, unknown> ? I : void
type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : undefined
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
type Tags<A extends unknown[]> = readonly string[] | ((...args: A) => readonly string[])
/** Read before `run`, for one user's tag: `tags: (_, ctx) => [`entitlements:${ctx.user.id}`]`. */
type QueryTags<I, A> = Tags<[input: I, ctx: Ctx<A>]>

/** What an `Impl` is called with. */
export interface ImplCall {
  fn: Fn
  input: unknown
  ctx: Context
  request: Request
}

/** A server function's body in Rust: `remote('rust://search')` or `native('media')`, from `@weft-js/start/rust` (research 36, 37). */
export interface Impl {
  readonly kind: string
  readonly target: string
  readonly service: string
  call(c: ImplCall): Promise<{ value: unknown; tags: string[]; touched: string[] }>
}

/** Errors a function raises by name, with the data each carries: a Rust function's become an enum. */
export type Errors = Record<string, StandardSchemaV1>

/** `query()` with a `run` on this server. */
export interface QueryDef<S, O, A = undefined> extends FnOptions {
  input?: S
  /** The result's shape: checked in dev and tests (C002), and the contract's `output`. */
  output?: StandardSchemaV1
  /** `'user'`: refuse a call with no session (A002). The contract's auth scope. */
  auth?: A
  /** An example result, for what `output` can't say: sizes a pending view (research 31 §2). */
  shape?: O extends (infer R)[] ? DeepPartial<R>[] : DeepPartial<O>
  /** What invalidates it: the client cache, the request cache and the shared cache all go by these. */
  tags?: QueryTags<Out<S>, A>
  /** `required: true`: `weft check` and `weft build` fail on a target with no real change feed, and the server won't start without one (R013, R015). */
  live?: {
    required?: boolean
    /** A real round trip against a target that isn't production, in `weft check` and `weft build`. `true` finds `WEFT_STAGING_URL` or `STAGING_DATABASE_URL`; a string names a target in `live.targets`. */
    verify?: true | string | VerifyOptions
  }
  /** Turn on the shared server cache (across requests). Omit it and the query runs once per request. */
  cache?: {
    life?: Life
    /** One cached value per signed-in user: `ctx.user` is readable. */ scope?: 'user'
  }
  /** Named failures, for the client as `FnError.code` and `.data`. */
  errors?: Errors
  run: (args: { input: Out<S>; ctx: Ctx<A> }) => O | Promise<O>
  impl?: undefined
  /** Set by the `weft:start` plugin: `<export>.<file hash>`. */
  $id?: string
}

/** The same declaration with its body elsewhere: `output` is required, because it's the whole contract for what comes back. */
export type ImplQueryDef<S, OS extends StandardSchemaV1, A = undefined> = Omit<
  QueryDef<S, Out<OS>, A>,
  'run' | 'impl' | 'output'
> & { output: OS; impl: Impl; run?: undefined }
/** `mutation()` with `impl` and an `output` schema: no `run` here. */
export type ImplMutationDef<S, OS extends StandardSchemaV1, A = undefined> = Omit<
  MutationDef<S, Out<OS>, A>,
  'run' | 'impl' | 'output'
> & { output: OS; impl: Impl; run?: undefined }

/** `mutation()` with a `run` on this server. */
export interface MutationDef<S, O, A = undefined> extends FnOptions {
  input?: S
  output?: StandardSchemaV1
  auth?: A
  /** Tags whose queries the response refreshes (single-flight) and whose cached values it drops. */
  invalidates?: Tags<[input: Out<S>, result: Awaited<O>]>
  /** Client only: predict the result. Each call's layers are re-applied on new values until it settles. */
  optimistic?: (args: { input: In<S> }, cache: OptimisticCache) => void
  errors?: Errors
  run: (args: { input: Out<S>; ctx: Ctx<A> }) => O | Promise<O>
  impl?: undefined
  $id?: string
}

/** The typed "no query" input: `getTodo(() => (id.value ? { id: id.value } : skip))`. */
export const skip: unique symbol = Symbol.for('weft.skip') as never
/** The marker a live query's input takes to subscribe to nothing yet. */
export type Skip = typeof skip

type Arg<I> = I | (() => I | Skip)

/** What `query()` returns: call it for a resource, or `.live()` for one that stays current. */
export interface Query<I, O> {
  /** The live value, read in a component or a defineState setup (Q001 elsewhere: use `fetch`). */
  (
    ...args: [I] extends [void] ? [input?: undefined | (() => undefined | Skip)] : [input: Arg<I>]
  ): Resource<O>
  /** The value as a promise: in `load`, handlers, server code and tests. Through the request or client cache. */
  fetch(...args: [I] extends [void] ? [] : [input: I]): Promise<O>
  /** A placeholder result to size a pending view by (last seen, else declared), or undefined when nothing is known. */
  shape(...args: [I] extends [void] ? [] : [input: I]): O | undefined
  /**
   * The same value, refetched whenever a mutation anywhere invalidates one of its tags. `.live` is the connection's
   * status. `keep`: how long the subscription outlives its last reader (`'30s'`, `'session'`).
   */
  live(
    ...args: [I] extends [void]
      ? [input?: undefined | (() => undefined | Skip), options?: LiveOptions]
      : [input: Arg<I>, options?: LiveOptions]
  ): LiveQuery<O>
  readonly kind: 'query'
  readonly $id: string
}

/** What `mutation()` returns: call it, or read its `pending` and `error`. */
export interface Mutation<I, O> {
  (...args: [I] extends [void] ? [] : [input: I]): Promise<O>
  /** A call is in flight. */
  readonly pending: Derived<boolean>
  /** The last call's failure, until the next call succeeds. */
  readonly error: Derived<unknown>
  readonly kind: 'mutation'
  readonly $id: string
}

/** `degraded`: connected, and writes from outside the app arrive late or not at all. `.liveMode` says which. */
export type LiveStatus = 'connecting' | 'live' | 'degraded' | 'reconnecting' | 'offline'
/**
 * How writes reach this page. `app`: mutations only, no `changes` configured. `feed`: the database reports every change.
 * `external`: a separate listener does, through the bus. `poll`: an estimate, every few seconds. `off`: mutations only, though `changes` asks for more.
 */
export type LiveMode = 'app' | 'feed' | 'external' | 'poll' | 'off'
/** `.live()`: how long it's kept, and whether it refuses to run without a real feed. */
export interface LiveOptions {
  keep?: string | number
  /** Fail `weft check`, `weft build` and server startup rather than run without a real change feed (R013, R015). */
  required?: boolean
}
/** A resource that also says how live it is. */
export type LiveQuery<O> = Resource<O> & {
  readonly live: Derived<LiveStatus>
  readonly liveMode: Derived<LiveMode>
}

/** Any definition, as the executor and transports see it. */
export interface Fn {
  kind: 'query' | 'mutation' | 'stream' | 'channel' | 'shared'
  $id: string
  def: {
    input?: StandardSchemaV1
    output?: StandardSchemaV1
    message?: StandardSchemaV1
    shape?: unknown
    auth?: AuthScope
    run?: (args: {
      input: unknown
      ctx: Context
      signal?: AbortSignal
      lastEventId?: unknown
    }) => unknown
    impl?: Impl
    errors?: Errors
    tags?: Tags<[input: unknown, ctx?: Context]>
    cache?: { life?: Life; scope?: 'user' }
    invalidates?: Tags<[unknown, unknown]>
    optimistic?: (args: { input: unknown }, cache: OptimisticCache) => void
    /** `channel` and `sharedState` (research 32). */
    params?: StandardSchemaV1
    authorize?: unknown
    left?: (args: { id: string; ctx: Context; params: unknown; room: unknown }) => unknown
    recheck?: (args: { id: string; ctx: Context; reply: unknown }) => unknown
    client?: Record<string, StandardSchemaV1>
    server?: Record<string, StandardSchemaV1>
    on?: Record<string, (args: never) => unknown>
    limits?: { perSecond?: number }
    key?: StandardSchemaV1
    value?: StandardSchemaV1
    initial?: unknown
  }
}

/** Every definition by id (the server answers `/_weft/fn/<id>` from it). */
export const fns = new Map<string, Fn>()
let auto = 0

// ---- errors and redirects -----------------------------------------------------------------------------------

/** A diagnostic thrown by @weft-js/start: `code` (Q001…) and a fix in the message, like weft's StateError. */
export class StartError extends Error {
  /** The HTTP status, when `extra` sets one. */
  declare status?: number
  /** Field by field, when `extra` sets them. */
  declare issues?: SchemaIssue[]
  /** What a declared error carries. */
  declare data?: unknown
  /** `raise`: this is a failure the function declares, so its message reaches the client. */
  declare typed?: boolean
  constructor(
    public code: string,
    message: string,
    fix?: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(`${code}: ${message}${fix ? `\n  fix: ${fix}` : ''}`)
    Object.assign(this, extra)
  }
}

/** A failed server function call, as the client sees it. */
export class FnError extends Error {
  code?: string
  status: number
  issues?: SchemaIssue[]
  /** What a declared error (`errors`) carries. */
  data?: unknown
  constructor(
    e: { message?: string; code?: string; issues?: SchemaIssue[] | undefined; data?: unknown },
    status: number,
  ) {
    super(e.message ?? `server function failed (${status})`)
    this.status = status
    Object.assign(this, { code: e.code, issues: e.issues, data: e.data })
  }
}

declare const redirectBrand: unique symbol
/** What `redirect()` throws: a loader or a function's way to send the page elsewhere. */
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
  // oxlint-disable-next-line typescript/only-throw-error -- control flow, not a failure: a stack costs and nothing reads it
  throw { isRedirect: true, href, status } as Redirect
}

/** Whether a thrown value is a `redirect()`. */
export const isRedirect = (v: unknown): v is Redirect =>
  !!v && typeof v === 'object' && (v as Partial<Redirect>).isRedirect === true

/**
 * Fail with an error the function declares in `errors`. The client sees it as `FnError.code` and `.data`, whether `run`
 * or a Rust `impl` raised it.
 */
export function raise(code: string, data?: unknown): never {
  throw new StartError(code, `failed: ${code}`, undefined, { status: 400, data, typed: true })
}

/** Refuse a value the schema can't judge (`email` is taken): `<Form>` shows it next to the field, as a schema issue. */
export function invalid(fields: Record<string, string>): never {
  throw new StartError('Q002', Object.keys(fields).join(', '), undefined, {
    status: 422,
    issues: Object.entries(fields).map(([k, message]) => ({ message, path: k.split('.') })),
  })
}

/** Issues as a form shows them: by field (`a.b`), and the ones that name no field. */
export function fieldsOf(issues: readonly SchemaIssue[] = []) {
  const errors: Record<string, string> = {}
  let message: string | undefined
  for (const i of issues) {
    const key = i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.')
    if (key) errors[key] ??= i.message
    else message ??= i.message
  }
  return { errors, message }
}

type Tree = Record<string, unknown>

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

/** A form's fields as a mutation's input, on both sides (research 29 §5): `a.b` nests, `x[]` and repeats are arrays. */
export function decodeForm(data: FormData): Record<string, unknown> {
  const out: Tree = {}
  for (const [name, value] of data) {
    if (name[0] === '$' || (typeof value !== 'string' && !value.size)) continue // `$fn`; a file input left empty
    const list = name.endsWith('[]')
    const path = (list ? name.slice(0, -2) : name).split('.')
    if (path.some((p) => UNSAFE.has(p))) continue
    let at = out
    for (const p of path.slice(0, -1)) {
      const next = at[p]
      at = (next && typeof next === 'object' ? next : (at[p] = {})) as Tree
    }
    const k = path.at(-1)!
    // Own keys only: a field named `toString` is a field, not the method every object inherits.
    const had = Object.hasOwn(at, k)
    if (list) ((had ? at[k] : (at[k] = [])) as unknown[]).push(value)
    else if (had) at[k] = [at[k]].flat().concat(value)
    else at[k] = value
  }
  return out
}

// ---- keys -------------------------------------------------------------------------------------------------------

/** JSON with sorted object keys: the same input gives the same key on both sides (no input: `''`; JSON sends null). */
export function stable(v: unknown): string {
  if (v == null) return ''
  return JSON.stringify(v, (_, x: Record<string, unknown>) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  )
}

/** The cache key of one call: the function's id and its input in a stable order. */
export const keyOf = (id: string, input: unknown) => `${id}:${stable(input)}`

// ---- runtime hooks ------------------------------------------------------------------------------------------------

/** One cached entry as the server sends it: `[id, input, value, tags]` (page payload, navigation, refreshes). */
export type Wire = [id: string, input: unknown, value: unknown, tags: string[]]

/** What the transports answer (research 27 §3). */
export interface Answer {
  v?: unknown
  t?: string[]
  c?: Wire[]
  r?: string
  /** `r` is a full load: the session changed, so nothing cached may survive. */ x?: 1
}

/** How a client call reaches the server: `fetch` by default, a fake under test. */
export interface Transport {
  query(id: string, input: unknown): Promise<Answer>
  /** `form`: the input came from a form, so strings may be coerced; a FormData is sent as is (it holds files). */
  mutate(
    id: string,
    input: unknown,
    refresh: [string, unknown][],
    form?: true | FormData,
  ): Promise<Answer>
}

/**
 * Set by the server half (server.tsx): the request in progress and the executor. `navigate` overrides the client
 * router's (tests). Unset in plain tests.
 */
export const runtime: {
  scope?: (() => Scope | undefined) | undefined
  /** Run `fn` with `scope` current (the request's AsyncLocalStorage). */
  enter?: (<T>(scope: unknown, fn: () => T) => T) | undefined
  exec?: typeof Exec
  transport?: Transport
  navigate?: ((href: string, replace?: boolean) => void) | undefined
  /** Set by the server's first request (and in dev when `drizzle/` grows): what each database applies before its first statement (db/core.ts). */
  migrations?: { list: { tag: string; sql: string }[]; report(e: unknown): void } | undefined
  /** The gates of clients whose statements can't be held (Prisma's): the server waits on them per request, and a failure doesn't fail it. */
  dbs?: Set<() => Promise<void> | undefined>
  /** Fan invalidated tags out to live subscribers (hub.ts). `origin`: the connection that needs no poke. */
  poke?: ((tags: string[], origin?: string | null) => Promise<void>) | undefined
  /** This tab's realtime connection: sent with mutations, so the tab doesn't poke itself. */
  conn?: string | undefined
  /** `room.in(params).publish`: socket.ts, on a server or under the fake. */
  channels?: {
    publish(
      fn: Fn,
      params: unknown,
      name: string,
      message: unknown,
      options?: { exceptSelf?: boolean; from?: string },
    ): Promise<void>
    set(fn: Fn, key: unknown, value: unknown): Promise<void>
  }
} = {}

/** The realtime connection's status and "this tab is older than the server" (research 30 §2). */
export const rt = createRoot(
  () => ({
    status: state<LiveStatus>('connecting'),
    mode: state<LiveMode>('app'),
    stale: state(false),
  }),
  null,
)
/** The server runs a different build than this tab loaded: offer a reload. */
export const stale: Derived<boolean> = rt.stale

const go = (href: string, replace?: boolean) =>
  runtime.navigate ? runtime.navigate(href, replace) : void client.navigate?.(href, { replace })

/** @weft-js/core/test's controls, when it's loaded; the first look registers the cache reset it runs after each test. */
let registered = false
/** The test controls, once `@weft-js/core/test` has registered them. */
export const net = () => {
  const n = Reflect.get(globalThis, Symbol.for('weft.net')) as NetControl | undefined
  if (n && !registered) {
    registered = true
    n.resets.push(() => {
      cache.clear()
      clearTimeout(again)
      again = undefined
      tries = callId = open = 0
    })
  }
  return n
}

/** @weft-js/core/test's fake-transport controls (research 27 §7). */
export interface NetControl {
  latency: number
  ctx?: object
  /** Server extensions for this test (`net.extension`). */
  extensions: ServerExtension[]
  online(): boolean
  fails: Map<string, unknown[]>
  handlers: Map<string, (input: unknown, ctx: Context) => unknown>
  log: { id: string; kind: string; input: unknown }[]
  inflight: Set<Promise<unknown>>
  als: { run<T>(store: unknown, fn: () => T): T; getStore(): unknown }
  resets: (() => unknown)[]
  /** Subscriptions an owner holds: open at the end of a test, they're T012. */
  open: Map<object, [what: string, close: () => void]>
  /** The realtime fake, while one is connected: `net.push`, `net.poke`, `net.drop`. */
  rt?:
    | {
        push(id: string, msg: unknown): number
        poke(tags: string[]): Promise<void>
        drop(): void
        subscriptions(): { kind: string; id: string; input: unknown }[]
      }
    | undefined
  /** The channel fake, while a socket is open. */
  ws?:
    | {
        publish(id: string, params: unknown, name: string, msg: unknown): Promise<void>
        drop(): void
        recheck(): Promise<void>
      }
    | undefined
  /** What this client's sockets sent, across reconnects. */
  sent: { id: string; name: string; msg: unknown }[]
  reconnects: number
}

// ---- definitions --------------------------------------------------------------------------------------------------

const oneBody = (def: { run?: unknown; impl?: unknown; $id?: string }) => {
  if (def.run && def.impl)
    throw new StartError(
      'R103',
      `\`${def.$id ?? 'a function'}\` has both \`run\` and \`impl\``,
      'keep one: `impl` replaces the body',
    )
}

/** A server function that reads, with its output typed by a schema. */
export function query<
  OS extends StandardSchemaV1,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: ImplQueryDef<S, OS, A>): Query<In<S>, Out<OS>>
/** A server function that reads, with its output typed by `run`. */
export function query<
  O,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: QueryDef<S, O, A>): Query<In<S>, Awaited<O>>
/** A server function that reads: cached by input on the client, and tagged for what invalidates it. */
export function query(def: unknown): unknown {
  const d = def as Fn['def'] & { $id?: string }
  oneBody(d)
  const id = d.$id ?? `q${++auto}`
  const fn: Fn = { kind: 'query', $id: id, def: d }
  fns.set(id, fn)
  const q = (input?: unknown) => use(fn, input)
  q.fetch = (input?: unknown) => fetchQuery(fn, input)
  q.shape = (input?: unknown) => shapeOf(fn, input)
  q.live = (input?: unknown, options?: LiveOptions) => liveQuery(fn, input, options)
  return Object.assign(q, { kind: 'query', $id: id, [FN]: fn })
}

/** A server function that writes, with its output typed by a schema. */
export function mutation<
  OS extends StandardSchemaV1,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: ImplMutationDef<S, OS, A>): Mutation<In<S>, Out<OS>>
/** A server function that writes, with its output typed by `run`. */
export function mutation<
  O,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: MutationDef<S, O, A>): Mutation<In<S>, Awaited<O>>
/** A server function that writes, and invalidates the queries that read what it changed. */
export function mutation(def: unknown): unknown {
  const d = def as Fn['def'] & { $id?: string }
  oneBody(d)
  const id = d.$id ?? `m${++auto}`
  const fn: Fn = { kind: 'mutation', $id: id, def: d }
  fns.set(id, fn)
  // Module-level boxes, read on the client only (a server render never shows a call in flight).
  const { calls, error } = createRoot(
    () => ({ calls: state(0), error: state<unknown>(undefined) }),
    null,
  )
  const pending = createRoot(() => derived(() => calls.value > 0), null)
  const m = (input?: unknown) => mutate(fn, input, calls, error)
  return Object.assign(m, {
    kind: 'mutation',
    $id: id,
    pending,
    error: {
      get value() {
        return error.value
      },
    },
    [FN]: fn,
    [SUBMIT]: (input: unknown, form: true | FormData) => mutate(fn, input, calls, error, form),
  })
}

const FN = Symbol.for('weft.fn')
/** `<Form>`'s call: a mutation handle's `m(input)` with the input marked as coming from a form. */
export const SUBMIT = Symbol.for('weft.submit')
/** The definition behind a query or mutation handle (also accepts the definition). */
export const fnOf = (h: unknown): Fn => ((h as Record<symbol, Fn> | null)?.[FN] ?? h) as Fn

// ---- server and client calls ---------------------------------------------------------------------------------

const server = () => runtime.scope?.() ?? (net()?.als.getStore() as Scope | undefined)
/** The request scope in progress, on the server or under the fake transport. */
export const currentScope = server
/** Run `fn` with `scope` current. */
export const enter = <T>(scope: unknown, fn: () => T): T =>
  runtime.enter ? runtime.enter(scope, fn) : net() ? net()!.als.run(scope, fn) : fn()

function fetchQuery(fn: Fn, input: unknown): Promise<unknown> {
  const scope = server()
  if (scope) return runtime.exec!.fetchQuery(scope, fn, input).then((e) => e.v)
  if (runtime.exec && !net())
    return runtime.exec
      .fetchQuery(runtime.exec.createScope(new Request('http://localhost/')), fn, input)
      .then((e) => e.v)
  const e = entry(fn, input)
  return untrack(() => fresh(e)) ? Promise.resolve(untrack(() => e.value.value)) : load(e)
}

function use(fn: Fn, input: unknown): Resource<unknown> {
  if (!getOwner())
    throw DEV
      ? new StartError(
          'Q001',
          `\`${fn.$id}()\` (a live query) was called outside a component or scope`,
          `\`await ${name(fn)}.fetch(input)\` in \`load\`, handlers and server code`,
        )
      : new StartError('Q001', fn.$id)
  const read = () => (typeof input === 'function' ? (input as () => unknown)() : input)
  return resource(
    () => {
      const arg = read()
      if (arg === skip) return undefined
      const scope = server()
      if (scope) return runtime.exec!.readQuery(scope, fn, arg)
      const e = entry(fn, arg)
      e.readers++
      onCleanup(() => void e.readers--)
      const v = e.value.value // tracked: a new base or layer re-runs this, and the resource settles to it in place
      if (fresh(e)) return v
      if (e.has.value && predicted(e)) {
        e.held = true // the prediction shows now, and a read waits for the calls behind it
        return v
      }
      return e.has.value ? load(e).catch(() => untrack(() => e.value.value)) : load(e) // a failed refetch leaves what's on screen
    },
    {
      data: false,
      shape: {
        of: fn,
        read() {
          const arg = read()
          return arg === skip ? undefined : shapeOf(fn, arg)
        },
      },
    },
  )
}

/** Research 31 §2: this entry's value or the query's last seen, masked; else the declared shape. */
function shapeOf(fn: Fn, input: unknown): unknown {
  const limit: number | undefined = (input as { limit?: number } | undefined)?.limit
  const here = entries.get(keyOf(fn.$id, input))
  const e = server()
    ? undefined
    : here && untrack(() => here.has.value)
      ? here
      : lastSeen.get(fn.$id)
  if (e)
    return mask(
      untrack(() => e.value.value),
      limit,
    )
  const tree = runtime.exec ? runtime.exec.shapeOf(fn) : fn.def.shape
  return tree === undefined ? undefined : fill(tree, limit)
}

/** `q()` plus a subscription: its tags come from the server, and a poke is a local `cache.invalidate`. */
function liveQuery(fn: Fn, input: unknown, options?: LiveOptions): LiveQuery<unknown> {
  const r = use(fn, input)
  const scope = server()
  if (scope) scope.live = true
  else
    effect(
      () => {
        const arg = typeof input === 'function' ? (input as () => unknown)() : input
        if (arg === skip) return
        let gone = false,
          stop: (() => void) | undefined
        const held = import('./live').then((m) => {
          m.use(liveApi)
          if (!gone) stop = m.hold(fn, arg, options)
        })
        void track(held)
        onCleanup(() => {
          gone = true
          stop?.()
        })
      },
      () => {},
    )
  return Object.assign(r, { live: rt.status, liveMode: rt.mode })
}

const name = (fn: Fn) => fn.$id.replace(/\..*$/, '')

// ---- the client cache -----------------------------------------------------------------------------------------

interface Layer {
  m: number
  apply: (draft: unknown) => unknown
  waiting?: boolean
}
interface Entry {
  key: string
  id: string
  input: unknown
  base: State<unknown>
  has: State<boolean>
  stale: State<boolean>
  layers: State<Layer[]>
  value: Derived<unknown>
  tags: string[]
  readers: number
  p?: Promise<unknown> | undefined
  /** The `clock` when `p` left. */
  since: number
  /** The `clock` when something newer than any read in flight reached the entry. */
  gen: number
  /** Which overlapping run of calls last landed a reply here. */
  run: number
  /** A value was turned away while layers were on it: it reads again once they're done. */
  held?: boolean
  /** When a server value last landed. */
  at: number
}

const entries = new Map<string, Entry>()
/** Orders what reaches an entry: a read or a navigation that left before `gen` is older than what's there. */
let clock = 0
/** When each tag was last invalidated: a value read before that is out of date, whether or not the cache held it then. */
const written = new Map<string, number>()
const passed = (tags: string[], since: number) => tags.some((t) => written.get(t)! > since)
/** Each query's latest entry: a skeleton for other args takes its shape (research 31 §4). */
const lastSeen = new Map<string, Entry>()
/** Objects an optimistic layer made (`cache.isOptimistic(row)`). */
let made = new WeakSet<object>()

function entry(fn: Fn, input: unknown): Entry {
  if (!registered) net()
  const key = keyOf(fn.$id, input)
  let e = entries.get(key)
  if (e) {
    entries.delete(key) // the map is in order of use: `evict` starts from its far end
    entries.set(key, e)
  } else {
    // Owned by no component: the entry outlives its readers (the next reader finds it seeded).
    e = createRoot(() => {
      const base = state<unknown>(undefined),
        has = state(false),
        dated = state(false),
        layers = state<Layer[]>([])
      const value = derived(() => {
        let v = base.value
        if (!has.value) return v
        for (const l of layers.value) v = produce(v, l.apply)
        return v
      })
      return {
        key,
        id: fn.$id,
        input,
        base,
        has,
        stale: dated,
        layers,
        value,
        tags: [],
        readers: 0,
        since: 0,
        gen: 0,
        run: 0,
        at: 0,
      }
    }, null)
    entries.set(key, e)
    if (entries.size > ceiling) evict(e)
  }
  return e
}

const ENTRIES = 1000
/** When to look again: a quarter past what's left, so a page with thousands of readers doesn't walk them all per entry. */
let ceiling = ENTRIES
/** A search box writes an entry per keystroke for the tab's life. What nothing reads goes, least recently used first. `fresh` is about to get its reader. */
function evict(fresh: Entry) {
  for (const e of entries.values()) {
    if (entries.size <= ENTRIES) break
    if (
      e !== fresh &&
      !e.readers &&
      !e.p &&
      !untrack(() => e.layers.value.length) &&
      lastSeen.get(e.id) !== e
    )
      entries.delete(e.key)
  }
  ceiling = Math.max(ENTRIES, entries.size + (entries.size >> 2))
}

const fresh = (e: Entry) => e.has.value && !e.stale.value

/** A prediction no reply has confirmed yet. */
const predicted = (e: Entry) => e.layers.value.some((l) => !l.waiting)

function load(e: Entry): Promise<unknown> {
  if (e.p && e.gen <= e.since) return e.p
  // What's read now may or may not hold the calls in flight, so it can't go under their layers: it waits for them.
  if (untrack(() => e.has.value && predicted(e))) {
    e.held = true
    return Promise.resolve(untrack(() => e.value.value))
  }
  const since = (e.since = clock)
  const p: Promise<unknown> = transport()
    .query(e.id, e.input)
    .then(
      (a) => {
        if (e.p === p) e.p = undefined
        tries = 0
        if (a.r !== undefined) {
          go(a.r, true)
          redirect(a.r)
        }
        const tags = a.t ?? []
        if (untrack(() => !e.has.value) && passed(tags, since)) return load(e) // a first load's tags come with its answer
        if (!land(e, a.v, tags, since)) {
          if (e.p) return e.p
          if (untrack(() => e.stale.value)) return load(e)
        }
        return untrack(() => e.value.value)
      },
      (err) => {
        if (e.p === p) e.p = undefined
        untrack(() => {
          if (!e.has.value) return
          if (err instanceof FnError && (err.status === 401 || err.status === 403)) forget(e)
          else if (!isRedirect(err) && (!(err instanceof FnError) || err.status >= 500)) retry()
        })
        throw err
      },
    )
  return (e.p = p)
}

/** The server refused this session, so the value may not be this user's any more: readers get the first-load error. */
function forget(e: Entry) {
  e.has.value = false
  e.base.value = undefined
  if (lastSeen.get(e.id) === e) lastSeen.delete(e.id)
}

/** How often a failed read is tried again, doubling, for as long as something on screen is out of date. */
const RETRY = 1000,
  RETRIES = 30_000
let again: ReturnType<typeof setTimeout> | undefined
let tries = 0

function retry() {
  if (again === undefined) again = setTimeout(owed, Math.min(RETRIES, RETRY * 2 ** tries++))
}

/** Read what readers are owed, once the tab can use it. `online` and a returning tab come here at once. */
function owed() {
  clearTimeout(again)
  again = undefined
  // Off a browser `onLine` isn't there, and that isn't offline.
  if (globalThis.document?.hidden || (navigator as { onLine?: boolean }).onLine === false) return // `back` or `online` comes here
  untrack(() => {
    for (const e of entries.values())
      if (e.readers && e.has.value && e.stale.value && !e.p && !e.held && !predicted(e))
        load(e).catch(() => {})
  })
}

/** A read or a navigation's value lands, unless something newer got here after it left, or layers are on the entry. */
function land(e: Entry, v: unknown, tags: string[], since: number): boolean {
  return untrack(() => {
    if (e.gen > since) return false
    if (e.has.value && predicted(e)) return !(e.held = true)
    setBase(e, v, tags)
    return true
  })
}

/** Mark the entry out of date: a read already out is older than what it has to tell. */
function outdate(e: Entry) {
  e.gen = ++clock
  e.stale.value = true
}

/** The layers that held a value off are gone: read once, now that every call behind them has answered. */
function relieve(e: Entry) {
  if (!e.held || predicted(e)) return
  e.held = false
  outdate(e)
  load(e).catch(() => {})
}

/** A server value lands: shared with the old base, layers of settled calls dropped, readers updated in place. */
function setBase(e: Entry, v: unknown, tags: string[]) {
  untrack(() => {
    e.gen = ++clock
    e.at = performance.now()
    e.tags = tags
    e.base.value = share(e.base.value, v)
    e.has.value = true
    e.stale.value = false
    lastSeen.set(e.id, e)
    if (e.layers.value.some((l) => l.waiting))
      e.layers.value = e.layers.value.filter((l) => !l.waiting)
  })
}

/** Seed the cache from the server (the page's `#weft-cache`, a navigation's `c`). `since`: when that navigation left. */
export function seed(list: Wire[] | null | undefined, since = Infinity) {
  for (const [id, input, v, tags] of list ?? []) {
    const e = entry(fns.get(id) ?? ({ $id: id } as Fn), input)
    if (land(e, v, tags, since) && passed(tags, since)) outdate(e)
  }
}

/** Mark entries with any of `tags` stale: entries with readers refetch now, the rest on their next read. */
function staleTags(tags: string[], except: Set<string> = new Set()) {
  if (!tags.length) return
  ++clock
  for (const t of tags) {
    written.delete(t) // in order of use, like `entries`
    written.set(t, clock)
  }
  for (const t of written.keys()) {
    if (written.size <= ENTRIES) break
    written.delete(t)
  }
  untrack(() => {
    for (const e of entries.values())
      if (!except.has(e.key) && e.tags.some((t) => tags.includes(t))) outdate(e)
  })
  owed() // one a failed read left stale has nothing else to wake it
  client.invalidated?.(tags)
}

/** How old a value can be when its tab comes back and still be left alone. */
const FOCUS = 30_000

async function mutate(
  fn: Fn,
  input: unknown,
  calls: State<number>,
  error: State<unknown>,
  form?: true | FormData,
): Promise<unknown> {
  const scope = server()
  if (scope) return (await runtime.exec!.runMutation(scope, fn, input, [], !!form)).v
  const m = ++callId
  const touched = new Set<Entry>()
  let overlap = 0
  untrack(() => calls.value++)
  const drop = (e: Entry) => {
    e.layers.value = e.layers.value.filter((l) => l.m !== m)
  }
  const wait = (e: Entry) => {
    e.layers.value = e.layers.value.map((l) => (l.m === m ? { ...l, waiting: true } : l))
  }
  try {
    if (fn.def.optimistic) untrack(() => fn.def.optimistic!({ input }, overlay(m, touched)))
    const refresh = [...entries.values()]
      .filter((e) => e.readers > 0)
      .map((e) => [e.id, e.input] as [string, unknown])
    if (!open++) run++
    overlap = run
    const a = await settled(() => transport().mutate(fn.$id, input, refresh, form))
    let out: unknown
    untrack(() => {
      const refreshed = new Set<string>()
      const seen: Entry[] = []
      for (const w of a.c ?? []) {
        const e = entry(fns.get(w[0]) ?? ({ $id: w[0] } as Fn), w[1])
        refreshed.add(e.key)
        seen.push(e)
        // Replies don't say which came first, and one taken in arrival order can put back what a later call changed: where
        // calls overlap on an entry its layers stay, in order, and it reads once the last has answered.
        if (e.held || e.run === overlap || e.layers.value.some((l) => l.m !== m)) {
          e.held = true
          wait(e)
        } else {
          setBase(e, w[2], w[3])
          drop(e)
          e.run = overlap
        }
      }
      for (const e of touched) {
        if (refreshed.has(e.key)) continue
        // S011: the server sent no fresh value for an entry this call predicted. Keep the layer until the entry's
        // next value (refetched now) instead of flashing back to the old one.
        if (DEV && !e.tags.some((t) => a.t?.includes(t)))
          console.warn(
            `weft: S011 \`${fn.$id}\`'s optimistic updated \`${e.key}\` (tags ${JSON.stringify(e.tags)}), but its invalidated tags ${JSON.stringify(a.t ?? [])} don't cover it: the prediction had no fresh value to land on.\n  fix: add one of its tags to \`invalidates\``,
          )
        wait(e)
        e.held = true
      }
      staleTags(a.t ?? [], refreshed)
      for (const e of seen) relieve(e)
      for (const e of touched) relieve(e)
      error.value = undefined
      out = a.v
    })
    if (a.t?.length) peers?.postMessage(a.t)
    if (a.x) peers?.postMessage(0)
    if (a.r !== undefined) {
      if (a.x) location.assign(a.r)
      else go(a.r)
    }
    return out
  } catch (err) {
    untrack(() => {
      for (const e of touched) {
        drop(e) // only this call's prediction goes
        if (overlap && (!(err instanceof FnError) || err.status >= 500)) e.held = true // the reply was lost, not the write: it may have landed
      }
      flush() // readers roll back now, not when the read below answers
      for (const e of touched) relieve(e)
      error.value = err
    })
    throw err
  } finally {
    untrack(() => calls.value--)
  }
}
let callId = 0
/** Calls in flight, and which unbroken run of overlapping calls they belong to. */
let open = 0
let run = 0
const settled = async <T>(call: () => Promise<T>) => {
  try {
    return await call()
  } finally {
    open--
  }
}

/** The `cache` an `optimistic` gets: `update` and `set` add this call's layers instead of writing the base. */
function overlay(m: number, touched: Set<Entry>): OptimisticCache {
  const push = (q: unknown, input: unknown, apply: Layer['apply']) => {
    const e = entry(fnOf(q), input)
    touched.add(e)
    e.layers.value = [...e.layers.value, { m, apply }]
  }
  return {
    ...cache,
    update: (q, input, recipe) => push(q, input, recipe as Layer['apply']),
    set: (q, input, value) => push(q, input, () => value),
  }
}

/** A query handle, whatever its input: what the cache needs of one. */
export type QueryRef<O> = Pick<Query<void, O>, 'kind' | '$id'> & {
  fetch(...args: never[]): Promise<O>
}

/** The cache as an `optimistic` sees it. */
export interface OptimisticCache {
  /** Change a query's cached value with a draft (copy-on-write: untouched rows keep their identity). */
  update<O>(q: QueryRef<O>, input: unknown, recipe: (draft: O) => O | void): void
  set<O>(q: QueryRef<O>, input: unknown, value: O): void
  get<O>(q: QueryRef<O>, input?: unknown): O | undefined
  /** The value (a row) was made by a pending optimistic layer. */
  isOptimistic(value: unknown): boolean
}

/**
 * The client cache. In `optimistic`, `update`/`set` add layers; elsewhere they write the base (until the next server
 * value). `invalidate` marks tags stale (readers refetch).
 */
export const cache: OptimisticCache & {
  invalidate(...tags: string[]): Promise<void> | undefined
  clear(): void
} = {
  update(q, input, recipe) {
    const e = entry(fnOf(q), input)
    if (untrack(() => e.has.value))
      setBase(
        e,
        produce(
          untrack(() => e.base.value),
          recipe as Layer['apply'],
        ),
        e.tags,
      )
  },
  set(q, input, value) {
    const e = entry(fnOf(q), input)
    setBase(e, value, e.tags)
  },
  get<O>(q: QueryRef<O>, input?: unknown) {
    const e = entries.get(keyOf(fnOf(q).$id, input))
    return e && (untrack(() => e.value.value) as O)
  },
  isOptimistic: (v) => !!v && typeof v === 'object' && made.has(v),
  invalidate(...tags) {
    const scope = server()
    if (scope) return runtime.exec!.invalidate(scope, tags)
    staleTags(tags)
    return undefined
  },
  clear() {
    entries.clear()
    lastSeen.clear()
    written.clear()
    ceiling = ENTRIES
    made = new WeakSet()
  },
}

if ((import.meta as ImportMeta & { hot?: unknown }).hot)
  client.refreshed = () =>
    untrack(() => {
      for (const e of entries.values()) outdate(e)
    })

/** Server: drop `tags` for this response and the shared cache. Client: refetch what reads them. */
export const invalidate = (...tags: string[]) => cache.invalidate(...tags)

// ---- transports ---------------------------------------------------------------------------------------------------

function transport(): Transport {
  if (runtime.transport) return runtime.transport
  if (net()) return inProcess
  return http
}

const answer = async (res: Response): Promise<Answer> => {
  const body = await res
    .json()
    .catch(() => ({ e: { message: `server function answered ${res.status}` } }))
  if (body.e) throw new FnError(body.e, res.status)
  return body
}

/** The browser's: GET for queries, POST + JSON + `x-weft` for mutations (research 27 §3). */
export const http: Transport = {
  query: (id, input) =>
    fetch(`/_weft/fn/${id}${input == null ? '' : `?i=${encodeURIComponent(stable(input))}`}`, {
      headers: { accept: 'application/json' },
    }).then(answer),
  mutate(id, input, f, form) {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-weft': '1',
      ...(runtime.conn && { 'x-weft-conn': runtime.conn }),
    }
    if (form instanceof FormData) form.set('$r', JSON.stringify(f))
    else headers['content-type'] = 'application/json'
    return fetch(`/_weft/fn/${id}`, {
      method: 'POST',
      headers,
      body:
        form instanceof FormData ? form : JSON.stringify({ i: input, f, ...(form && { c: 1 }) }),
    }).then(answer)
  },
}

/**
 * @weft-js/core/test's fake transport: the server's executor in process, with the controls @weft-js/core/test's `net` sets (latency,
 * failures, replaced functions, offline), and a JSON round trip both ways so values arrive as they would over HTTP.
 */
export const fakeScope = (exec: typeof Exec, n: NetControl, request: Request) =>
  exec.createScope(request, {
    context: () => n.ctx ?? {},
    handlers: n.handlers,
    dev: true,
    extensions: n.extensions,
    onDiagnostic: (d) =>
      console.warn(`weft: ${d.message.startsWith(d.code) ? '' : d.code + ' '}${d.message}`),
  })

type Call = (exec: typeof Exec, scope: Scope, fn: Fn) => Promise<Answer>

const inProcess: Transport = {
  query: (id, input) =>
    fake(id, 'query', input, (exec, scope, fn) =>
      exec.fetchQuery(scope, fn, input).then((e) => ({ v: e.v, t: e.tags })),
    ),
  mutate: (id, input, f, form) =>
    fake(id, 'mutation', input, (exec, scope, fn) => exec.runMutation(scope, fn, input, f, !!form)),
}

function fake(id: string, kind: string, input: unknown, call: Call): Promise<Answer> {
  return track(fakeCall(net()!, id, kind, input, call))
}

/** `net.settle()` waits for `p`. */
export function track<T>(p: Promise<T>): Promise<T> {
  const n = net()
  if (!n) return p
  n.inflight.add(p)
  const over = () => void n.inflight.delete(p)
  p.then(over, over)
  return p
}

async function fakeCall(
  n: NetControl,
  id: string,
  kind: string,
  input: unknown,
  call: Call,
): Promise<Answer> {
  n.log.push({ id, kind, input })
  const exec = (runtime.exec ??= await import('./exec'))
  if (n.latency)
    await new Promise((ok) => {
      setTimeout(ok, n.latency)
    })
  if (!n.online())
    throw Object.assign(new Error(`offline: ${id} wasn't sent`), { name: 'OfflineError' })
  const fails = n.fails.get(id)
  if (fails?.length) throw fails.shift()
  const fn = fns.get(id)
  if (!fn) throw new FnError({ code: 'Q009', message: `Q009: no server function \`${id}\`` }, 404)
  const scope = fakeScope(
    exec,
    n,
    new Request(`http://localhost/_weft/fn/${id}`, {
      method: kind === 'query' ? 'GET' : 'POST',
      headers: runtime.conn ? { 'x-weft-conn': runtime.conn } : {},
    }),
  )
  try {
    return JSON.parse(JSON.stringify(await n.als.run(scope, () => call(exec, scope, fn))))
  } catch (e) {
    if (isRedirect(e)) return { r: e.href }
    throw e instanceof StartError
      ? new FnError(
          { code: e.code, message: e.message, issues: e.issues, data: e.data },
          e.status ?? 500,
        )
      : e
  }
}

// ---- structural sharing and drafts ------------------------------------------------------------------------------

type Obj = Record<PropertyKey, unknown>

const plain = (v: unknown): v is Obj =>
  !!v &&
  typeof v === 'object' &&
  (Array.isArray(v) ||
    Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null)

/** `next`, with every subtree deep-equal to `prev`'s replaced by `prev`'s (TanStack's replaceEqualDeep). */
export function share<T>(prev: unknown, next: T): T {
  if (prev === next || !plain(prev) || !plain(next) || Array.isArray(prev) !== Array.isArray(next))
    return next
  const keys = Object.keys(next)
  let same = Object.keys(prev).length === keys.length
  const out = (Array.isArray(next) ? [] : {}) as Obj
  for (const k of keys) {
    out[k] = share(prev[k], next[k])
    if (out[k] !== prev[k]) same = false
  }
  return (same ? prev : out) as T
}

interface Draft {
  b: Obj
  c?: Obj
  px: Obj
  done?: Obj
}

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
  const unwrap = (v: unknown) =>
    v && typeof v === 'object' && byProxy.has(v) ? byProxy.get(v)!.b : v
  const cur = (n: Draft) => n.c ?? n.b
  const own = (n: Draft) => (n.c ??= (Array.isArray(n.b) ? n.b.slice() : { ...n.b }) as Obj)
  const node = (b: Obj): Draft => {
    let n = nodes.get(b)
    if (n) return n
    const self: Draft = (n = { b, px: b })
    n.px = new Proxy((Array.isArray(b) ? [] : {}) as Obj, {
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
        return d && { ...d, configurable: true, value: self.px[k] }
      },
    })
    nodes.set(b, n)
    byProxy.set(n.px, n)
    return n
  }
  // The result: copies where something changed, the original objects everywhere else.
  const fin = (n: Draft): Obj => {
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
  const deep = (v: unknown): unknown => {
    if (v && typeof v === 'object' && byProxy.has(v)) return fin(byProxy.get(v)!)
    if (Array.isArray(v)) return v.map(deep)
    if (plain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    return v
  }
  const root = node(base)
  const r = recipe(root.px as T)
  return (r === undefined || r === root.px ? fin(root) : deep(r)) as T
}

/** What `live.ts` reads from here; see its header. */
export const liveApi = {
  cache,
  currentScope,
  fakeScope,
  fns,
  FnError,
  keyOf,
  net,
  rt,
  runtime,
  skip,
  StartError,
  track,
}
/** What `live.ts` is handed, instead of a static import that would close a cycle. */
export type LiveApi = typeof liveApi

// ---- start-up ----------------------------------------------------------------------------------------------------

// In the browser, as the first route chunk that uses a query loads (before hydration): the page's entries, and
// whatever a navigation brought before this module loaded.
if (typeof document !== 'undefined' && !runtime.scope) {
  client.seed = seed
  client.now = () => clock
  seed(client.seeds)
  client.seeds = undefined
  const el = document.getElementById('weft-cache')
  if (el) seed(JSON.parse(el.textContent))
  // A stream's chunks say what landed: here is everything so far, and each one's script pushes the next.
  // They were read for this page, so anything written here since is newer.
  const landed = ((globalThis as { $wc?: { c: Wire[] }[] }).$wc ||= []),
    since = clock
  for (const l of landed) seed(l.c, since)
  landed.push = (...l) => {
    for (const x of l) seed(x.c, since)
    return Array.prototype.push.apply(landed, l)
  }
  const later: string[] = []
  const back = () => {
    if (document.hidden) return
    const old = performance.now() - FOCUS
    // Showing and focus can come apart: one already stale is being read, and marking it again would throw that read away.
    untrack(() => {
      for (const e of entries.values())
        if (e.readers && e.has.value && e.at < old && !e.stale.value) outdate(e)
    })
    if (later.length) staleTags(later.splice(0))
    owed()
  }
  // A hidden tab reads nothing until it shows: every open tab refetching on every write is what this would cost otherwise.
  if (peers)
    peers.onmessage = (m) => {
      if (!m.data) return // the session changed: run.tsx reloads
      if (document.hidden) later.push(...m.data)
      else staleTags(m.data)
    }
  addEventListener('focus', back)
  addEventListener('online', owed)
  document.addEventListener('visibilitychange', back)
}
