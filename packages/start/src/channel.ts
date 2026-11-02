// `channel` and `sharedState` (research 32): definitions on both sides, and the browser's half. One line per tab on the
// browser's one socket (link.ts), one join per id + params, shared by every reader and held by this module, so a remount within `keep`
// finds its messages. The socket server is socket.ts, and `room.in(params).publish` reaches it through
// `runtime.channels`, so nothing of the server ships here.

import { Box, DEV, batch, collect as boxes, createRoot, derived, effect, getOwner, onCleanup, state, untrack, type Derived, type State } from '@weft-js/core'
import { HANDOVER, openLine, socketDown } from './link'
import { currentScope, fns, FnError, keyOf, net, rt, runtime, skip, StartError, track, type Context, type Fn, type Skip, type StandardSchemaV1 } from './data'

// ---- definitions ----------------------------------------------------------------------------------------------------

type In<S> = S extends StandardSchemaV1<infer I, any> ? I : void
type Out<S> = S extends StandardSchemaV1<any, infer O> ? O : undefined
type Schemas = Record<string, StandardSchemaV1>
type Inputs<T extends Schemas> = { [K in keyof T]: In<T[K]> }
type Outputs<T extends Schemas> = { [K in keyof T]: Out<T[K]> }

export type ChannelStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'

export interface PublishOptions {
  /** Not back to the sender. */
  exceptSelf?: boolean
  /** Only to this connection, wherever it is: the `id` a handler was given. */
  to?: string
  /** Not kept for a resume: a cursor, a heartbeat, anything the next one replaces. */
  volatile?: boolean
}

export interface Room<P, M> {
  params: P
  /** To everyone in the room, on every instance. */
  publish<K extends keyof M & string>(name: K, message: M[K], options?: PublishOptions): Promise<void>
}

export interface ChannelDef<P extends StandardSchemaV1 | undefined, C extends Schemas, S extends Schemas> {
  params?: P
  /** Required (R001). Runs on every join and at each session re-check. `() => true` must be written out. */
  authorize: (args: { ctx: Context; params: Out<P> }) => boolean | Promise<boolean>
  /** Client → server, always validated. */
  client?: C
  /** Server → client, validated in dev and tests. */
  server?: S
  /** `id` is the sender's connection, the same one `left` gets. */
  on?: { [K in keyof C]?: (args: { msg: Out<C[K]>; id: string; ctx: Context; params: Out<P>; room: Room<Out<P>, Inputs<S>> }) => unknown }
  /** A connection stopped being in the room: it left, closed, or lost `authorize`. Not called if its instance dies. */
  left?: (args: { id: string; ctx: Context; params: Out<P>; room: Room<Out<P>, Inputs<S>> }) => unknown
  limits?: { perSecond?: number }
  $id?: string
}

export interface Connection<C, S> {
  readonly status: Derived<ChannelStatus>
  /** Which room this is. Changes when a function argument moves to another, even one already open. */
  readonly room: Derived<string | undefined>
  /** The last refusal or failure. */
  readonly error: unknown
  /** Ticks when the server couldn't resume: messages may be missing, so refetch what the room's history is. */
  readonly resets: Derived<number>
  /** Keep a room's messages of one name, in the cache: a remount within `keep` finds them. `key` drops a repeat. */
  collect<K extends keyof S & string>(name: K, options?: { max?: number; key?: (message: S[K]) => unknown }): Derived<S[K][]>
  /** Each message of one name, until the owner is disposed. */
  on<K extends keyof S & string>(name: K, fn: (message: S[K]) => void): () => void
  onReset(fn: () => void): () => void
  /** Resolves on the server's ack, rejects with what it refused. Waits up to 10 s for the socket; never retries. */
  send<K extends keyof C & string>(name: K, message: C[K]): Promise<void>
  /** Join again after `unauthorized`. */
  retry(): void
}

type Arg<P> = P | (() => P | Skip)
export interface ConnectOptions { keep?: string | number }

export interface Channel<P, C, S> {
  /** In a component or scope. A function argument re-joins when what it reads changes; `skip` leaves. */
  connect(...args: [P] extends [void] ? [params?: undefined | (() => undefined | Skip), options?: ConnectOptions] : [params: Arg<P>, options?: ConnectOptions]): Connection<C, S>
  /** On the server, from a mutation or a job. */
  in(...args: [P] extends [void] ? [] : [params: P]): { publish<K extends keyof S & string>(name: K, message: S[K]): Promise<void> }
  readonly kind: 'channel'
  readonly $id: string
}

const FN = Symbol.for('weft.fn')
let auto = 0

export function channel<P extends StandardSchemaV1 | undefined = undefined, C extends Schemas = {}, S extends Schemas = {}>(def: ChannelDef<P, C, S>): Channel<In<P>, Inputs<C>, Outputs<S>> {
  const id = def.$id ?? `c${++auto}`
  if (!(def as any).$stub && !def.authorize) throw new StartError('R001', `\`${id}\` has no \`authorize\`: anyone could join it`, 'add `authorize` (`() => true` must be written out)')
  const fn: Fn = { kind: 'channel', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  return {
    kind: 'channel', $id: id, [FN]: fn,
    connect: (params?: unknown, options?: ConnectOptions) => connect(fn, params, options) as any,
    in: (params?: unknown) => ({ publish: (name: string, message: unknown) => runtime.channels!.publish(fn, params, name, message) }),
  } as any
}

export interface SharedDef<K extends StandardSchemaV1, V extends StandardSchemaV1> {
  key: K
  value: V
  /** What a reader has until the server says otherwise. Kept in the client bundle, so plain data. */
  initial: Out<V>
  /** Both required (R001). */
  authorize: { read: (args: { ctx: Context; key: Out<K> }) => boolean | Promise<boolean>; write: (args: { ctx: Context; key: Out<K> }) => boolean | Promise<boolean> }
  $id?: string
}

/** A box in a scope: reads as a value, and a write is optimistic, sent, and last writer wins on the server. */
export type SharedBox<T> = State<T> & { readonly status: Derived<ChannelStatus>; readonly error: unknown }

export interface SharedState<K, V> {
  connect(key: K | (() => K | Skip), options?: ConnectOptions): SharedBox<V>
  /** On the server: write it from a mutation or a job. */
  in(key: K): { set(value: V): Promise<void> }
  readonly kind: 'shared'
  readonly $id: string
}

export function sharedState<K extends StandardSchemaV1, V extends StandardSchemaV1>(name: string, def: SharedDef<K, V>): SharedState<In<K>, Out<V>> {
  const id = def.$id ?? `shared:${name}`
  if (!(def as any).$stub && (!def.authorize?.read || !def.authorize?.write)) throw new StartError('R001', `\`${id}\` needs \`authorize: { read, write }\`: anyone could read or write it`, '`() => true` must be written out')
  const fn: Fn = { kind: 'shared', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  return {
    kind: 'shared', $id: id, [FN]: fn,
    connect: (key: unknown, options?: ConnectOptions) => shared(fn, key, options) as any,
    in: (key: unknown) => ({ set: (value: unknown) => runtime.channels!.set(fn, key, value) }),
  } as any
}

// ---- joins ----------------------------------------------------------------------------------------------------------

interface List { name: string; max: number; key?: (m: any) => unknown; box: State<any[]> }
interface Handle { on: Map<string, Set<(m: any) => void>>; resets: Set<() => void>; value?(v: { v: unknown; at: number }): void }
interface Join {
  n: number
  key: string
  fn: Fn
  params: unknown
  refs: number
  timer?: ReturnType<typeof setTimeout>
  cursor?: string
  joined: boolean
  refused: boolean
  status: State<ChannelStatus>
  error: State<unknown>
  resets: State<number>
  lists: Map<string, List>
  handles: Set<Handle>
  /** `send`s waiting for the join. */
  waiting: Set<() => void>
}

const joins = new Map<string, Join>()
const byN = new Map<number, Join>()
let nth = 0

const KEEP = 30_000
const ms = (keep: string | number = KEEP): number => {
  if (typeof keep === 'number') return keep
  const m = /^(\d+)(ms|s|m)$/.exec(keep)
  return m ? +m[1] * { ms: 1, s: 1000, m: 60_000 }[m[2] as 'ms' | 's' | 'm'] : Infinity
}

function acquire(fn: Fn, params: unknown): Join {
  const key = keyOf(fn.$id, params)
  let j = joins.get(key)
  if (!j) {
    j = createRoot(() => ({ n: ++nth, key, fn, params, refs: 0, joined: false, refused: false, status: state<ChannelStatus>('connecting'), error: state<unknown>(undefined), resets: state(0), lists: new Map(), handles: new Set(), waiting: new Set() }), null)
    if (DEV && net() && !net()!.resets.includes(reset)) net()!.resets.push(reset)
    joins.set(key, j)
    byN.set(j.n, j)
    if (live) enter(j)
    else start()
  }
  clearTimeout(j.timer)
  j.timer = undefined
  j.refs++
  return j
}

function release(j: Join, keep?: string | number) {
  if (--j.refs) return
  const t = ms(keep)
  if (t === Infinity) return
  if (t) j.timer = setTimeout(() => drop(j), t)
  else drop(j)
}

function drop(j: Join) {
  joins.delete(j.key)
  byN.delete(j.n)
  j.status.value = 'closed'
  if (live) send(['l', j.n])
  for (const w of j.waiting) w()
  if (!joins.size) live?.close()
}

function hold(j: Join, keep?: string | number): () => void {
  const token = {}
  const stop = () => {
    net()?.open.delete(token)
    release(j, keep)
  }
  if (DEV) net()?.open.set(token, [`channel \`${j.key}\``, stop])
  return stop
}

function listOf(j: Join, spec: { name: string; max: number; key?: (m: any) => unknown }): List {
  const id = `${spec.name}:${spec.max}:${spec.key ? String(spec.key) : ''}`
  let l = j.lists.get(id)
  if (!l) j.lists.set(id, (l = createRoot(() => ({ ...spec, box: state<any[]>([]) }), null)))
  return l
}

const NONE: never[] = []
type View = Join | undefined

/** The part `connect` and `shared` have in common: the current join, as the argument moves. */
function follow(fn: Fn, arg: unknown, options: ConnectOptions | undefined, handle: Handle, joined?: (j: Join) => void): State<View> {
  const view = state<View>(undefined)
  effect(() => {
    const params = typeof arg === 'function' ? (arg as () => unknown)() : arg
    if (params === skip) return undefined
    return untrack(() => {
      const j = acquire(fn, params)
      j.handles.add(handle)
      joined?.(j)
      const stop = hold(j, options?.keep)
      onCleanup(() => {
        j.handles.delete(handle)
        stop()
      })
      return j
    })
  }, now => { view.value = now })
  return view
}

function owned(fn: Fn) {
  if (!getOwner()) throw new StartError('W051', DEV ? `\`${fn.$id}.connect()\` was called outside a component or scope: nothing would close it` : fn.$id, DEV ? 'call it in a component, a `defineState` setup or `createRoot(dispose => …)`' : undefined)
}

/** `@weft-js/start/share`'s way in: a join that nothing on the page declared, so a tab shares this socket and its lifecycle. */
export const connectBuiltIn = ($id: string) => connect({ kind: 'channel', $id, def: {} } as Fn, undefined, { keep: 0 })

function connect(fn: Fn, arg: unknown, options?: ConnectOptions): Connection<any, any> {
  owned(fn)
  if (currentScope()) {
    const closed = { value: 'connecting' as ChannelStatus }
    return { status: closed, room: { value: undefined }, error: undefined, resets: { value: 0 }, collect: () => ({ value: NONE }), on: () => () => {}, onReset: () => () => {}, send: () => Promise.reject(new FnError({ message: 'a channel has no socket on the server' }, 500)), retry() {} }
  }
  const handle: Handle = { on: new Map(), resets: new Set() }
  const wanted: { name: string; max: number; key?: (m: any) => unknown }[] = []
  const view = follow(fn, arg, options, handle, j => { for (const w of wanted) listOf(j, w) })
  return {
    status: derived(() => view.value?.status.value ?? 'closed'),
    room: derived(() => view.value?.key),
    get error() { return view.value?.error.value },
    resets: derived(() => view.value?.resets.value ?? 0),
    collect(name, { max = 200, key } = {}) {
      const spec = { name, max, key }
      wanted.push(spec)
      const had = untrack(() => view.value)
      if (had) listOf(had, spec)
      return derived(() => {
        const j = view.value
        return j ? listOf(j, spec).box.value : NONE
      })
    },
    on(name, fn) {
      const set = handle.on.get(name) ?? new Set()
      handle.on.set(name, set)
      set.add(fn)
      const stop = () => void set.delete(fn)
      onCleanup(stop)
      return stop
    },
    onReset(fn) {
      handle.resets.add(fn)
      const stop = () => void handle.resets.delete(fn)
      onCleanup(stop)
      return stop
    },
    send(name, message) {
      const j = untrack(() => view.value)
      return j ? post(j, name, message) : Promise.reject(new FnError({ message: 'this channel is closed' }, 400))
    },
    retry() {
      const j = untrack(() => view.value)
      if (j?.refused) rejoin(j)
    },
  }
}

/** `Box.w` is the one way a write gets in, so a subclass sees every write, and `Instance` never touches it. */
class Shared<T> extends Box<T> {
  declare remote?: boolean
  declare pending: number
  declare base: { v: T; at: number }
  declare view: State<View>
  declare statusOf: Derived<ChannelStatus>
  declare problem: State<unknown>
  get status() { return this.statusOf }
  get error() { return this.problem.value }
  /** A server value: applied unless a local write is still on its way. */
  apply(v: { v: T; at: number }) {
    if (v.at >= this.base.at) this.base = v
    if (!this.pending) this.quiet(this.base.v)
  }
  quiet(v: T) {
    this.remote = true
    this.w(v)
    this.remote = false
  }
  w(v: T) {
    if (this.remote) return super.w(v)
    const j = untrack(() => this.view.value)
    if (!j) return super.w(v)
    super.w(v)
    this.pending++
    this.problem.value = undefined
    track(post(j, '$set', v).then(() => { this.pending-- }, e => {
      this.pending--
      this.problem.value = e
    }).finally(() => { if (!this.pending) this.quiet(this.base.v) }))
  }
}

function shared(fn: Fn, arg: unknown, options?: ConnectOptions): SharedBox<any> {
  owned(fn)
  const initial = fn.def.initial
  const [b] = boxes(() => new Shared<any>(initial))
  b.pending = 0
  b.base = { v: initial, at: 0 }
  b.problem = state<unknown>(undefined)
  if (currentScope()) {
    b.statusOf = { value: 'connecting' }
    b.view = state<View>(undefined)
    return b as unknown as SharedBox<any>
  }
  const handle: Handle = { on: new Map(), resets: new Set(), value: v => b.apply(v) }
  b.view = follow(fn, arg, options, handle, () => { b.base = { v: initial, at: 0 } })
  b.statusOf = derived(() => b.view.value?.status.value ?? 'closed')
  return b as unknown as SharedBox<any>
}

// ---- sends ----------------------------------------------------------------------------------------------------------

const ACK_WAIT = 10_000
const acks = new Map<number, { ok: () => void; no: (e: unknown) => void; n: number }>()
let ackId = 0

async function post(j: Join, name: string, message: unknown): Promise<void> {
  if (!j.joined && !j.refused) {
    await new Promise<void>(ok => {
      const done = () => {
        clearTimeout(t)
        j.waiting.delete(done)
        ok()
      }
      const t = setTimeout(done, ACK_WAIT)
      j.waiting.add(done)
    })
  }
  if (!j.joined) throw new FnError({ code: j.refused ? 'R011' : undefined, message: j.refused ? 'not allowed in this channel' : 'no connection: not sent' }, j.refused ? 403 : 503)
  const ack = ++ackId
  const p = new Promise<void>((ok, no) => acks.set(ack, { ok, no, n: j.n }))
  send(['m', j.n, ack, name, message])
  return track(p)
}

// ---- the socket ------------------------------------------------------------------------------------------------------

export interface SocketLink {
  send(text: string): void
  close(): void
}

/** This tab's line on the browser's one socket (link.ts). `done` gets the close code. */
function browser(frame: (d: any[]) => void, done: (code: number) => void): SocketLink {
  return openLine('c', '', text => frame(JSON.parse(text)), done)
}

/** @weft-js/core/test only: an opaque specifier, so a bundler keeps neither the fake nor the socket server (research 30 §10). */
const FAKE = './channel-fake.ts' // with its extension: nothing resolves this one for a linked package
function fake(frame: (d: any[]) => void, done: (code: number) => void): SocketLink {
  let link: SocketLink | undefined
  let up!: () => void
  track(new Promise<void>(ok => (up = ok)))
  const loading = import(/* @vite-ignore */ FAKE).then(m => m.open(frame, done, up)).then(l => (link = l), e => (up(), done(1006), Promise.reject(e))).catch(() => {})
  return { send: t => void track(loading.then(() => link?.send(t))), close: () => { void loading.then(() => link?.close()) } }
}

const BASE = 500, CAP = 30_000, PING = 20_000, DEAD = 45_000, HIDDEN = 300_000

let live: SocketLink | undefined
let open = false
let running = false
let attempt = 0
let build: string | undefined
let nudge: (() => void) | undefined
let parked = false
let hiddenAt: ReturnType<typeof setTimeout> | undefined

/** A leader tab can be hidden while a sibling is looking: `@weft-js/start/share` says when this socket must stay. */
export const keepOpen: { stay?: () => boolean } = {}

const send = (f: unknown[]) => live?.send(JSON.stringify(f))
const statusAll = (s: ChannelStatus) => { for (const j of joins.values()) if (!j.refused) j.status.value = s }

function enter(j: Join) {
  if (!open || !live) return
  send(['j', j.n, j.fn.$id, j.params, j.cursor])
}

function rejoin(j: Join) {
  j.refused = false
  j.status.value = 'connecting'
  if (running) enter(j)
  else start()
}

function start() {
  if (running) return
  running = true
  queueMicrotask(() => void run())
}

function dispatch(j: Join, name: string, msg: any) {
  if (name === '$v') {
    for (const h of j.handles) h.value?.(msg)
    return
  }
  for (const l of j.lists.values()) {
    if (l.name !== name) continue
    const was = untrack(() => l.box.value)
    const key = l.key?.(msg)
    const at = l.key ? was.findIndex(m => l.key!(m) === key) : -1
    const next = at >= 0 ? was.map((m, i) => (i === at ? msg : m)) : [...was, msg]
    l.box.value = next.length > l.max ? next.slice(-l.max) : next
  }
  for (const h of j.handles) for (const f of h.on.get(name) ?? []) f(msg)
}

function frame(d: any[]) {
  batch(() => {
    const j = typeof d[1] === 'number' ? byN.get(d[1]) : undefined
    if (d[0] === 'h') {
      if (build && d[1].b && d[1].b !== build) rt.stale.value = true
      build = d[1].b
      open = true
      attempt = 0
      for (const x of joins.values()) if (!x.refused) enter(x)
    } else if (d[0] === 'j' && j) {
      j.cursor ??= d[2]
      j.joined = true
      j.error.value = undefined
      j.status.value = 'open'
      for (const w of [...j.waiting]) w()
    } else if (d[0] === 'm' && j) {
      j.cursor = d[2]
      dispatch(j, d[3], d[4])
    } else if (d[0] === 'r' && j) {
      j.cursor = d[2]
      for (const l of j.lists.values()) l.box.value = []
      j.resets.value++
      for (const h of j.handles) for (const f of h.resets) f()
    } else if (d[0] === 'e' && j) {
      j.joined = false
      j.refused = true
      j.error.value = new FnError(d[2], d[2].code === 'R011' ? 403 : 400)
      j.status.value = d[2].code === 'R011' ? 'unauthorized' : 'closed'
      for (const w of [...j.waiting]) w()
    } else if (d[0] === 'a') {
      const p = acks.get(d[2])
      acks.delete(d[2])
      if (d[3]) p?.no(new FnError(d[3], d[3].code === 'R011' ? 403 : 400))
      else p?.ok()
    }
  })
}

const sleep = (t: number) => new Promise<void>(ok => {
  const timer = setTimeout(ok, t)
  nudge = () => {
    clearTimeout(timer)
    nudge = undefined
    ok()
  }
})

async function run() {
  listen(true)
  const fakeNet = () => (DEV ? net() : undefined)
  while (joins.size) {
    if (parked || navigator.onLine === false) {
      statusAll('reconnecting')
      await sleep(CAP)
      continue
    }
    let code = 0
    let dead: ReturnType<typeof setTimeout> | undefined
    let ping: ReturnType<typeof setInterval> | undefined
    const alive = () => {
      clearTimeout(dead)
      if (!fakeNet()) dead = setTimeout(() => live?.close(), DEAD)
    }
    await new Promise<void>(done => {
      const take = (d: any[]) => {
        alive()
        frame(d)
      }
      live = (fakeNet() ? fake : browser)(take, c => {
        code = c
        done()
      })
      alive()
      if (!fakeNet()) ping = setInterval(() => send(['p']), PING)
    })
    clearTimeout(dead)
    clearInterval(ping)
    live = undefined
    open = false
    for (const j of joins.values()) j.joined = false
    for (const [id, p] of acks) {
      acks.delete(id)
      p.no(new FnError({ message: 'the connection dropped: this may or may not have been sent' }, 503))
    }
    if (!joins.size) break
    const n = fakeNet()
    if (n) n.reconnects++
    if (code === 4401) for (const j of joins.values()) j.status.value = 'unauthorized'
    else statusAll('reconnecting')
    if (!n) await sleep(code === HANDOVER ? 0 : backoff())
  }
  running = false
  attempt = 0
  listen(false)
}

/** Full jitter, 0.5 s doubling to 30 s (research 30 §6). */
const backoff = () => Math.random() * Math.min(CAP, BASE * 2 ** attempt++)

// ---- the page -------------------------------------------------------------------------------------------------------

const wake = () => {
  parked = false
  nudge?.()
}
function park() {
  parked = true
  live?.close()
}
const parkHidden = () => {
  if (keepOpen.stay?.()) hiddenAt = setTimeout(parkHidden, HIDDEN)
  else park()
}
function onVisibility() {
  clearTimeout(hiddenAt)
  if (document.visibilityState === 'hidden') hiddenAt = setTimeout(parkHidden, HIDDEN)
  else wake()
}
/** A sibling came back while this tab's socket was parked. */
export const wakeSocket = () => wake()
const onOffline = () => {
  socketDown()
  live?.close()
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
  for (const j of joins.values()) clearTimeout(j.timer)
  joins.clear()
  byN.clear()
  acks.clear()
  live?.close()
  nudge?.()
  build = undefined
  parked = false
  attempt = 0
  net()!.reconnects = 0
  untrack(() => { rt.stale.value = false })
}
