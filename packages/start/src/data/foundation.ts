import { createRoot, state, type Derived } from '@weft-js/core'
import { client } from '../router'
import type * as Exec from '../exec'
import type { Scope } from '../exec'
import type { Fn, LiveStatus, LiveMode, NetControl, Transport } from './types'

/** The typed "no query" input: `getTodo(() => (id.value ? { id: id.value } : skip))`. */
export const skip: unique symbol = Symbol.for('weft.skip') as never
/** The marker a live query's input takes to subscribe to nothing yet. */
export type Skip = typeof skip

/** Every definition by id (the server answers `/_weft/fn/<id>` from it). */
export const fns = new Map<string, Fn>()
let auto = 0
export const nextAuto = () => ++auto

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

export const go = (href: string, replace?: boolean) =>
  runtime.navigate ? runtime.navigate(href, replace) : void client.navigate?.(href, { replace })

/** @weft-js/core/test's controls, when it's loaded; the first look registers the cache reset it runs after each test. */
export let registered = false
let reset = () => {}
export const configureReset = (fn: () => void) => {
  reset = fn
}
/** The test controls, once `@weft-js/core/test` has registered them. */
export const net = () => {
  const n = Reflect.get(globalThis, Symbol.for('weft.net')) as NetControl | undefined
  if (n && !registered) {
    registered = true
    n.resets.push(() => {
      reset()
    })
  }
  return n
}

export const FN = Symbol.for('weft.fn')
/** `<Form>`'s call: a mutation handle's `m(input)` with the input marked as coming from a form. */
export const SUBMIT = Symbol.for('weft.submit')
/** The definition behind a query or mutation handle (also accepts the definition). */
export const fnOf = (h: unknown): Fn => ((h as Record<symbol, Fn> | null)?.[FN] ?? h) as Fn

// ---- server and client calls ---------------------------------------------------------------------------------

export const server = () => runtime.scope?.() ?? (net()?.als.getStore() as Scope | undefined)
/** The request scope in progress, on the server or under the fake transport. */
export const currentScope = server
/** Run `fn` with `scope` current. */
export const enter = <T>(scope: unknown, fn: () => T): T =>
  runtime.enter ? runtime.enter(scope, fn) : net() ? net()!.als.run(scope, fn) : fn()
