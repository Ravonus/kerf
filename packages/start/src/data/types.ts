import type { Derived, Resource } from '@weft-js/core'
import type { Context, FnOptions, Skip } from '../data'
import type { ServerExtension } from '../extension'

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

/** `'minutes'` etc. or seconds: how long the shared server cache keeps a value (research 27 §4). */
export type Life = 'seconds' | 'minutes' | 'hours' | 'days' | 'max' | number

/** `auth: 'user'` narrows `ctx.user` to non-null in `run` (A002 answers a call with no session). */
export type AuthScope = 'user'
type Ctx<A> = A extends 'user'
  ? Context extends { user: infer U }
    ? Omit<Context, 'user'> & { user: NonNullable<U> }
    : Context
  : Context

export type In<S> = S extends StandardSchemaV1<infer I, unknown> ? I : void
export type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : undefined
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
    /** When a change invalidates it, run it again at once in the background, so the next visitor finds it ready
     * instead of paying for the miss. For what every visitor reads: a menu, settings, a search index. */
    warm?: boolean
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
    cache?: { life?: Life; scope?: 'user'; warm?: boolean }
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
