// The realtime client (research 30 §6): one connection per tab, one subscription per function + input, shared by every
// reader and owned by this module, not by a component (PLAN §4.2), so an unmounting tab loses neither its subscription
// nor its folded state for `keep`. `q.live()` imports this on its first call; `stream` through `stream.ts`, so an app
// that uses neither ships none of it.
//
// A poke is a local `cache.invalidate`: readers refetch through `query`, and the keyed list writes what changed.

import { DEV, batch, createRoot, derived, effect, getOwner, onCleanup, state, untrack, type Derived, type State } from 'weft'
import type { AuthScope, Context, Fn, LiveApi, LiveOptions, LiveStatus, Skip, StandardSchemaV1 } from './data'
import type { Body, SubEntry, Tracked } from './hub'

// `data.ts` hands these over (`use`). A static import would close a cycle with its `import('./live')`, and the bundler
// would then keep this chunk, the hub and the split they force in apps that never read `.live`.
let cache: LiveApi['cache'], currentScope: LiveApi['currentScope'], fakeScope: LiveApi['fakeScope'], fns: LiveApi['fns'], FnError: LiveApi['FnError'], keyOf: LiveApi['keyOf'], net: LiveApi['net'], rt: LiveApi['rt'], runtime: LiveApi['runtime'], skip: LiveApi['skip'], StartError: LiveApi['StartError'], track: LiveApi['track']
export const use = (api: LiveApi) => void ({ cache, currentScope, fakeScope, fns, FnError, keyOf, net, rt, runtime, skip, StartError, track } = api)

// ---- definitions ----------------------------------------------------------------------------------------------------

type In<S> = S extends StandardSchemaV1<infer I, any> ? I : void
type Out<S> = S extends StandardSchemaV1<any, infer O> ? O : undefined

export type StreamStatus = LiveStatus | 'done'

export interface StreamDef<S, M, A = undefined> {
  input?: S
  /** Checked in dev and tests (C002), and the contract's `message`. */
  message?: StandardSchemaV1<any, M>
  auth?: A
  /** `lastEventId`: the last `tracked` id the client saw, on a resume. Stop when `signal` aborts. */
  run: (args: { input: Out<S>; ctx: Context; signal: AbortSignal; lastEventId?: string }) => AsyncIterable<M | Tracked<M>>
  $id?: string
}

export interface StreamOptions<M, T> extends LiveOptions {
  /** Keep every message: `fold(acc, message)`. Its state lives in the cache, so a remount finds it. */
  fold?: (acc: T, message: M) => T
  initial?: T
  /** Messages the server holds for a slow client. A fold defaults to 256; without one, the latest wins. */
  buffer?: number
}

export interface Stream<T> {
  /** The latest message, or the fold. */
  readonly value: T
  readonly status: Derived<StreamStatus>
  readonly error: unknown
}

export interface StreamFn<I, M> {
  (input: Arg<I>): Stream<M | undefined>
  <T>(input: Arg<I>, options: StreamOptions<M, T> & { initial: T }): Stream<T>
  (input: Arg<I>, options: StreamOptions<M, M>): Stream<M | undefined>
  readonly kind: 'stream'
  readonly $id: string
}
type Arg<I> = I | (() => I | Skip)

const FN = Symbol.for('weft.fn')
let auto = 0

export function stream<M, S extends StandardSchemaV1 | undefined = undefined, const A extends AuthScope | undefined = undefined>(def: StreamDef<S, M, A>): StreamFn<In<S>, M> {
  const id = def.$id ?? `s${++auto}`
  const fn: Fn = { kind: 'stream', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  return Object.assign((input: unknown, options?: StreamOptions<any, any>) => read(fn, input, options), { kind: 'stream', $id: id, [FN]: fn }) as any
}

// ---- subscriptions --------------------------------------------------------------------------------------------------

interface View { fold?: (acc: any, m: any) => any; initial: unknown; box: State<unknown> }
interface Sub {
  n: number
  key: string
  fn: Fn
  input: unknown
  refs: number
  timer?: ReturnType<typeof setTimeout>
  /** Stream: the last id, sent back on a resume. Query: its tags, from the ack. */
  cursor?: string
  tags: string[]
  buffer?: number
  acked: boolean
  views: Map<string, View>
  error: State<unknown>
  done: State<boolean>
}

const subs = new Map<string, Sub>()
const byN = new Map<number, Sub>()
let nth = 0

const KEEP = 30_000
const ms = (keep: string | number = KEEP): number => {
  if (typeof keep === 'number') return keep
  const m = /^(\d+)(ms|s|m)$/.exec(keep)
  return m ? +m[1] * { ms: 1, s: 1000, m: 60_000 }[m[2] as 'ms' | 's' | 'm'] : Infinity // 'session'
}

function acquire(fn: Fn, input: unknown): Sub {
  const key = keyOf(fn.$id, input)
  let s = subs.get(key)
  if (!s) {
    s = createRoot(() => ({ n: ++nth, key, fn, input, refs: 0, tags: [], acked: false, views: new Map(), error: state<unknown>(undefined), done: state(false) }), null)
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

function read(fn: Fn, input: unknown, o: StreamOptions<any, any> = {}): Stream<any> {
  if (!getOwner())
    throw new StartError('W051', DEV ? `\`${fn.$id}()\` (a stream) was called outside a component or scope: nothing would close it` : fn.$id, DEV ? 'call it in a component, a `defineState` setup or `createRoot(dispose => …)`' : undefined)
  const scope = currentScope()
  if (scope) {
    scope.live = true // the server renders `initial`, and the client hydrates to the same
    return { value: o.initial, status: rt.status, error: undefined }
  }
  const view = state<{ s: Sub; v: View } | undefined>(undefined)
  const fold = o.fold ? String(o.fold) : ''
  effect(() => {
    const arg = typeof input === 'function' ? (input as () => unknown)() : input
    if (arg === skip) return undefined
    return untrack(() => {
      const s = acquire(fn, arg)
      if (o.fold) s.buffer ??= o.buffer ?? 256
      else if (o.buffer) s.buffer ??= o.buffer
      let v = s.views.get(fold)
      if (!v) s.views.set(fold, (v = createRoot(() => ({ fold: o.fold, initial: o.initial, box: state<unknown>(o.initial) }), null)))
      v.fold = o.fold
      onCleanup(held(s, o.keep))
      return { s, v }
    })
  }, now => { view.value = now })
  const status = derived(() => (view.value?.s.done.value ? 'done' : rt.status.value) as StreamStatus)
  return {
    get value() { const now = view.value; return now ? now.v.box.value : o.initial },
    status,
    get error() { return view.value?.s.error.value },
  }
}

// ---- the connection ---------------------------------------------------------------------------------------------------

export interface Link {
  /** Resolves when the connection ends. */
  open(body: Body, frame: (event: string, data: any) => void, signal: AbortSignal, alive: () => void): Promise<void>
  change(body: Body): Promise<void>
}

const post = (body: Body, signal?: AbortSignal) =>
  fetch('/_weft/rt', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-weft': '1' }, body: JSON.stringify(body), signal })

const http: Link = {
  async open(body, frame, signal, alive) {
    const res = await post(body, signal)
    if (!res.ok) {
      const { e } = await res.json().catch(() => ({ e: {} }))
      throw new FnError(e, res.status)
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      alive()
      buf += decoder.decode(value, { stream: true })
      for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
        if (buf[0] === ':') continue
        const line = buf.indexOf('\n')
        frame(buf.slice(7, line), JSON.parse(buf.slice(line + 7, i)))
      }
    }
  },
  async change(body) {
    const res = await post(body)
    if (!res.ok) throw new FnError({}, res.status)
  },
}

/**
 * weft/test only (`live-fake.ts`). The specifier hides it from the bundler: an `import()` it can see would keep the
 * fake, and through it the hub, as chunks of every app, used or not.
 */
const FAKE = './live-fake'
const fake: Link = {
  open(body, frame, signal) {
    let up!: () => void
    track(new Promise<void>(ok => (up = ok))) // `net.settle()` waits for the connection, not for its end
    return import(/* @vite-ignore */ FAKE).then(m => m.open(body, frame, signal, up, subs, (close: () => unknown) => (closeHub = close))).finally(up)
  },
  change: async body => (await import(/* @vite-ignore */ FAKE)).change(body),
}

const link = (): Link => (DEV && net() ? fake : http)
let closeHub: (() => unknown) | undefined

const BASE = 500, CAP = 30_000, DEAD = 45_000, HIDDEN = 300_000

/** Full jitter: anywhere from 0 to 0.5 s, 1 s, 2 s … 30 s. */
export const backoff = (attempt: number, random = Math.random) => random() * Math.min(CAP, BASE * 2 ** attempt)

interface Live { ac: AbortController; k?: string; sent: Set<number> }
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
  const page = JSON.parse(el.textContent!) as { c?: string; b?: string }
  el.remove()
  cursor = page.c
  build = page.b
  seeded = !!cursor
}

const entry = (s: Sub): SubEntry => (s.fn.kind === 'query' ? [s.n, 'q', s.fn.$id, s.input] : [s.n, 's', s.fn.$id, s.input, s.cursor, s.buffer])
const set = (status: LiveStatus) => { rt.status.value = status }

function flushPokes() {
  const tags = [...pokes]
  pokes = new Set()
  pokeTimer = undefined
  cache.invalidate(...tags)
}

function frame(event: string, d: any) {
  batch(() => {
    if (event === 'h') {
      if (build && d.b && d.b !== build) rt.stale.value = true
      build = d.b
      if (conn) conn.k = runtime.conn = d.k
      cursor ??= d.c
      attempt = 0
      set('live')
      sync() // what changed while connecting
    } else if (event === 'a') {
      const s = byN.get(d[0])
      if (!s) return
      s.tags = d[1]
      s.error.value = undefined
      if (DEV && !s.tags.length) console.warn(`weft: W053 \`${s.fn.$id}\` is read with \`.live()\` but declares no \`tags\`: no mutation can ever poke it.\n  fix: add \`tags\` to the query`)
      // Data older than the subscription may have missed a write. A page's first connect is covered by its cursor.
      if (!s.acked && !seeded && s.tags.length) cache.invalidate(...s.tags)
      s.acked = true
    } else if (event === 'p') {
      cursor = d.c
      for (const t of d.t) pokes.add(t)
      if (net()) flushPokes()
      else pokeTimer ??= setTimeout(flushPokes, 50 + Math.random() * 250)
    } else if (event === 'R') {
      cursor = d.c
      cache.invalidate(...[...subs.values()].flatMap(s => s.tags))
    } else if (event === 'm') {
      const s = byN.get(d[0])
      if (!s) return
      if (d[1] !== null) s.cursor = d[1]
      s.error.value = undefined
      for (const v of s.views.values()) v.box.value = v.fold ? v.fold(v.box.value, d[2]) : d[2]
    } else if (event === 'r') {
      const s = byN.get(d[0])
      if (!s) return
      s.cursor = undefined
      for (const v of s.views.values()) v.box.value = v.initial
    } else if (event === 'f') {
      const s = byN.get(d[0])
      if (s) s.done.value = true
    } else if (event === 'e') {
      const s = byN.get(d[0])
      if (s) s.error.value = new FnError(d[1], d[1].code === 'A002' ? 401 : 500)
    } else if (event === 'b') retry = d.retry
  })
}

/** Woken early by `online`, by the tab showing again and by a change to the set. */
const sleep = (t: number) => new Promise<void>(ok => {
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
    if (parked || navigator.onLine === false) {
      set(parked ? 'reconnecting' : 'offline')
      await sleep(CAP)
      continue
    }
    const ac = new AbortController()
    const live: Live = (conn = { ac, sent: new Set(byN.keys()) })
    let dead: ReturnType<typeof setTimeout> | undefined
    const alive = () => {
      clearTimeout(dead)
      if (!net()) dead = setTimeout(() => ac.abort(), DEAD)
    }
    alive()
    retry = undefined
    try {
      await link().open({ c: cursor, s: [...subs.values()].filter(s => !s.done.value).map(entry) }, frame, ac.signal, alive)
    } catch (e) {
      if (!ac.signal.aborted && e instanceof FnError) for (const s of subs.values()) untrack(() => { s.error.value = e })
    }
    clearTimeout(dead)
    conn = undefined
    runtime.conn = undefined
    seeded = false
    if (!subs.size) break
    const n = net()
    if (n) n.reconnects++
    set(navigator.onLine === false ? 'offline' : 'reconnecting')
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
    if (!live?.k) return
    const add = [...byN.values()].filter(s => !live.sent.has(s.n))
    const gone = [...live.sent].filter(n => !byN.has(n))
    if (!add.length && !gone.length) return
    for (const s of add) live.sent.add(s.n)
    for (const n of gone) live.sent.delete(n)
    try {
      await link().change({ k: live.k, s: add.map(entry), d: gone })
    } catch {
      live.ac.abort()
    }
  })
  track(changing)
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

/** weft/test, after each test. */
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
  untrack(() => { rt.stale.value = false; rt.status.value = 'connecting' })
}
