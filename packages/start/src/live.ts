// The realtime client (research 30 §6): one connection per tab, a line on the browser's one socket (link.ts), one subscription per function + input, shared by every
// reader and owned by this module, not by a component (PLAN §4.2), so an unmounting tab loses neither its subscription
// nor its folded state for `keep`. `q.live()` imports this on its first call; `stream` through `stream.ts`, so an app
// that uses neither ships none of it.
//
// A poke is a local `cache.invalidate`: readers refetch through `query`, and the keyed list writes what changed.

import { DEV, batch, createRoot, state, untrack } from '@weft-js/core'
import type { AuthScope, Fn, LiveMode, LiveOptions, LiveStatus, StandardSchemaV1 } from './data'
import type { SubEntry } from './hub'
import { noSockets } from './link'
import { transports } from './live/transport'
import { backoff, CAP } from './live/backoff'

import { cache, fns, FnError, keyOf, net, rt, runtime, track } from './live/api'

import type { In, StreamDef, StreamFn, StreamOptions } from './live/types'
import type { Sub } from './live/sub-types'
import { read } from './live/read'
import type { Link } from './live/transport'
import { ack, update, type Row } from './live/frames'
export { backoff } from './live/backoff'
export { use } from './live/api'
export type { StreamStatus, StreamDef, StreamOptions, Stream, StreamFn } from './live/types'
export type { Link } from './live/transport'

// ---- definitions ----------------------------------------------------------------------------------------------------

const FN = Symbol.for('weft.fn')
let auto = 0

export function stream<
  M,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: StreamDef<S, M, A>): StreamFn<In<S>, M> {
  const id = def.$id ?? `s${++auto}`
  const fn: Fn = { kind: 'stream', $id: id, def: def as unknown as Fn['def'] }
  fns.set(id, fn)
  return Object.assign(
    (input: unknown, options?: StreamOptions<never, unknown>) =>
      read(fn, input, options, acquire, held),
    { kind: 'stream', $id: id, [FN]: fn },
  ) as unknown as StreamFn<In<S>, M>
}

// ---- subscriptions --------------------------------------------------------------------------------------------------

const subs = new Map<string, Sub>()
const byN = new Map<number, Sub>()
let nth = 0

const KEEP = 30_000
const ms = (keep: string | number = KEEP): number => {
  if (typeof keep === 'number') return keep
  const m = /^(\d+)(ms|s|m)$/.exec(keep)
  return m ? +m[1]! * { ms: 1, s: 1000, m: 60_000 }[m[2] as 'ms' | 's' | 'm'] : Infinity // 'session'
}

function acquire(fn: Fn, input: unknown): Sub {
  const key = keyOf(fn.$id, input)
  let s = subs.get(key)
  if (!s) {
    s = createRoot(
      () => ({
        n: ++nth,
        key,
        fn,
        input,
        refs: 0,
        tags: [],
        acked: false,
        views: new Map(),
        error: state<unknown>(undefined),
        done: state(false),
      }),
      null,
    )
    // Not at the top level: a side effect there would keep this chunk in apps that never read `.live`.
    if (DEV && net() && !net()!.resets.includes(reset)) net()!.resets.push(reset)
    subs.set(key, s)
    byN.set(s.n, s)
    sync()
  }
  clearTimeout(s.timer)
  s.timer = undefined
  s.refs++
  return s
}

function release(s: Sub, keep?: string | number) {
  if (--s.refs) return
  const t = ms(keep)
  if (t === Infinity) return
  if (t) s.timer = setTimeout(() => drop(s), t)
  else drop(s)
}

function drop(s: Sub) {
  subs.delete(s.key)
  byN.delete(s.n)
  sync()
}

/** A reader in the owner of `hold`'s caller. T012 sees it until it lets go. */
function held(s: Sub, keep?: string | number): () => void {
  const token = {}
  const stop = () => {
    net()?.open.delete(token)
    release(s, keep)
  }
  if (DEV) net()?.open.set(token, [`live subscription \`${s.key}\``, stop])
  return stop
}

/** `q.live()`'s subscription, from data.ts. */
export function hold(fn: Fn, input: unknown, options?: LiveOptions): () => void {
  return held(acquire(fn, input), options?.keep)
}

// ---- the connection ---------------------------------------------------------------------------------------------------

const { http, socket } = transports(() => (retry = 0))

/**
 * @weft-js/core/test only (`live-fake.ts`). The specifier hides it from the bundler: an `import()` it can see would keep the
 * fake, and through it the hub, as chunks of every app, used or not.
 */
const FAKE = './live-fake.ts'
const fake: Link = {
  open(body, heard, signal) {
    let up!: () => void
    void track(
      new Promise<void>((ok) => {
        up = ok
      }),
    ) // `net.settle()` waits for the connection, not for its end
    return import(/* @vite-ignore */ FAKE)
      .then((m) =>
        m.open(body, heard, signal, {
          up,
          subs,
          closing: (close: () => unknown) => (closeHub = close),
        }),
      )
      .finally(up)
  },
  change: async (body) => (await import(/* @vite-ignore */ FAKE)).change(body),
}

/** Two sockets that never answered, and this host has none. */
const link = (): Link => (DEV && net() ? fake : noSockets() ? http : socket)
let via: Link = socket
let closeHub: (() => unknown) | undefined

const DEAD = 45_000,
  HIDDEN = 300_000

interface Live {
  ac: AbortController
  k?: string
  sent: Set<number>
}
let conn: Live | undefined
let running = false
let attempt = 0
/** The poke cursor. Seeded by the page, it covers what was published between the render and this connection. */
let cursor: string | undefined
let build: string | undefined
let seeded = false
let retry: number | undefined
let nudge: (() => void) | undefined
let hiddenAt: ReturnType<typeof setTimeout> | undefined
let parked = false
let changing: Promise<void> | undefined
let pokes = new Set<string>()
let pokeTimer: ReturnType<typeof setTimeout> | undefined

/** The page's `#weft-rt`, on the tab's first connect. */
function readPage() {
  const el = document.getElementById('weft-rt')
  if (!el) return
  const page = JSON.parse(el.textContent) as { c?: string; b?: string }
  el.remove()
  cursor = page.c
  build = page.b
  seeded = !!cursor
}

const entry = (s: Sub): SubEntry =>
  s.fn.kind === 'query'
    ? [s.n, 'q', s.fn.$id, s.input]
    : [s.n, 's', s.fn.$id, s.input, s.cursor ?? '', s.buffer ?? 0]
const set = (status: LiveStatus) => {
  rt.status.value = status
}
interface Linked {
  m: LiveMode
  d?: 1
}
/** The connection is up: how live that is depends on the server's feed. */
function linked(l?: Linked) {
  rt.mode.value = l?.m ?? 'app'
  set(l?.d ? 'reconnecting' : l?.m === 'poll' || l?.m === 'off' ? 'degraded' : 'live')
  if (DEV && l && l.m !== 'feed' && l.m !== 'external' && !warned) {
    warned = true
    console.warn(
      `weft: R016 live queries are \`degraded\` (mode \`${l.m}\`): writes from outside the app arrive late or not at all. The server log says why.`,
    )
  }
}
let warned = false
const offline = () => !navigator.onLine

function flushPokes() {
  const tags = [...pokes]
  pokes = new Set()
  pokeTimer = undefined
  void cache.invalidate(...tags)
}

function frame(event: string, data: unknown) {
  const d = data as Row &
    Record<'b' | 'k' | 'c', string> & { l?: Linked; t: string[]; retry: number }
  batch(() => {
    if (event === 'h') {
      if (build && d.b && d.b !== build) rt.stale.value = true
      build = d.b
      if (conn) conn.k = runtime.conn = d.k
      cursor ??= d.c
      attempt = 0
      linked(d.l)
      sync() // what changed while connecting
    } else if (event === 'a') {
      ack(d, byN, () => seeded)
    } else if (event === 'p') {
      cursor = d.c
      for (const t of d.t) pokes.add(t)
      if (net()) flushPokes()
      else pokeTimer ??= setTimeout(flushPokes, 50 + Math.random() * 250)
    } else if (event === 'R') {
      cursor = d.c
      void cache.invalidate(...[...subs.values()].flatMap((s) => s.tags))
    } else if (event === 'm' || event === 'r' || event === 'f' || event === 'e') {
      update(event, d, byN)
    } else if (event === 'L') linked(d as unknown as Linked)
    else if (event === 'b') retry = d.retry
  })
}

/** Woken early by `online`, by the tab showing again and by a change to the set. */
const sleep = (t: number) =>
  new Promise<void>((ok) => {
    const timer = setTimeout(ok, t)
    nudge = () => {
      clearTimeout(timer)
      nudge = undefined
      ok()
    }
  })

async function run() {
  running = true
  listen(true)
  readPage()
  while (subs.size) {
    if (parked || offline()) {
      set(parked ? 'reconnecting' : 'offline')
      await sleep(CAP)
      continue
    }
    const ac = new AbortController()
    conn = { ac, sent: new Set(byN.keys()) }
    let dead: ReturnType<typeof setTimeout> | undefined
    const alive = () => {
      clearTimeout(dead)
      if (!net()) dead = setTimeout(() => ac.abort(), DEAD)
    }
    alive()
    retry = undefined
    try {
      await (via = link()).open(
        { c: cursor, s: [...subs.values()].filter((s) => !s.done.value).map(entry) },
        frame,
        ac.signal,
        alive,
      )
    } catch (e) {
      if (!ac.signal.aborted && e instanceof FnError)
        for (const s of subs.values())
          untrack(() => {
            s.error.value = e
          })
    }
    clearTimeout(dead)
    conn = undefined
    runtime.conn = undefined
    seeded = false
    if (!subs.size) break
    const n = net()
    if (n) n.reconnects++
    set(offline() ? 'offline' : 'reconnecting')
    if (!n) await sleep(retry ?? backoff(attempt++))
  }
  running = false
  attempt = 0
  listen(false)
  set('connecting')
}

/** Bring the server's set up to date with `subs`, in place. A 404 (another instance, a restart) reconnects. */
function sync() {
  if (changing) return
  changing = Promise.resolve().then(async () => {
    changing = undefined
    if (!subs.size) return conn?.ac.abort()
    if (!running) return void run()
    const live = conn
    // Between connections the loop sleeps: a changed set wakes it, as the sleep promises.
    if (!live) return nudge?.()
    if (!live.k) return
    const add = [...byN.values()].filter((s) => !live.sent.has(s.n))
    const gone = [...live.sent].filter((n) => !byN.has(n))
    if (!add.length && !gone.length) return
    for (const s of add) live.sent.add(s.n)
    for (const n of gone) live.sent.delete(n)
    try {
      await via.change({ k: live.k, s: add.map(entry), d: gone })
    } catch {
      live.ac.abort()
    }
  })
  void track(changing)
}

// ---- the page -------------------------------------------------------------------------------------------------------

const wake = () => {
  parked = false
  nudge?.()
}

function park() {
  parked = true
  conn?.ac.abort()
}

function onOffline() {
  set('offline')
  conn?.ac.abort()
}

function onVisibility() {
  clearTimeout(hiddenAt)
  if (document.visibilityState === 'hidden') hiddenAt = setTimeout(park, HIDDEN)
  else wake()
}

function listen(on: boolean) {
  if (typeof window === 'undefined') return
  const m = on ? 'addEventListener' : 'removeEventListener'
  window[m]('online', wake)
  window[m]('offline', onOffline)
  window[m]('pagehide', park)
  window[m]('pageshow', wake)
  document[m]('visibilitychange', onVisibility)
  if (!on) clearTimeout(hiddenAt)
}

/** @weft-js/core/test, after each test. */
function reset() {
  for (const s of subs.values()) clearTimeout(s.timer)
  subs.clear()
  byN.clear()
  conn?.ac.abort()
  nudge?.()
  clearTimeout(pokeTimer)
  pokes = new Set()
  cursor = build = retry = undefined
  seeded = parked = false
  attempt = 0
  const n = net()!
  n.reconnects = 0
  n.rt = undefined
  void closeHub?.()
  untrack(() => {
    rt.stale.value = false
    rt.status.value = 'connecting'
  })
}
