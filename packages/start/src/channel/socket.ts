import { DEV, batch, createRoot, state, untrack, type State } from '@kerf-js/core'
import { HANDOVER, SOCKETS, openLine, socketDown } from '../link'
import { FnError, keyOf, net, rt, track, type Fn } from '../data'
import type { ChannelStatus } from '../channel'

// ---- joins ----------------------------------------------------------------------------------------------------------

export interface ListSpec {
  name: string
  max: number
  key?: ((m: never) => unknown) | undefined
}
export interface List extends ListSpec {
  box: State<unknown[]>
}
export interface Handle {
  on: Map<string, Set<(m: never) => void>>
  resets: Set<() => void>
  value?(v: { v: unknown; at: number }): void
}
export interface Join {
  n: number
  key: string
  fn: Fn
  params: unknown
  refs: number
  timer?: ReturnType<typeof setTimeout> | undefined
  cursor?: string | undefined
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

export const joins = new Map<string, Join>()
export const byN = new Map<number, Join>()
let nth = 0

const KEEP = 30_000
const ms = (keep: string | number = KEEP): number => {
  if (typeof keep === 'number') return keep
  const m = /^(\d+)(ms|s|m)$/.exec(keep)
  return m ? +m[1]! * { ms: 1, s: 1000, m: 60_000 }[m[2] as 'ms' | 's' | 'm'] : Infinity
}

export function acquire(fn: Fn, params: unknown): Join {
  const key = keyOf(fn.$id, params)
  let j = joins.get(key)
  if (!j) {
    j = createRoot(
      () => ({
        n: ++nth,
        key,
        fn,
        params,
        refs: 0,
        joined: false,
        refused: false,
        status: state<ChannelStatus>('connecting'),
        error: state<unknown>(undefined),
        resets: state(0),
        lists: new Map(),
        handles: new Set(),
        waiting: new Set(),
      }),
      null,
    )
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
  for (const w of Array.from(j.waiting)) w()
  if (!joins.size) live?.close()
}

export function hold(j: Join, keep?: string | number): () => void {
  const token = {}
  const stop = () => {
    net()?.open.delete(token)
    release(j, keep)
  }
  if (DEV) net()?.open.set(token, [`channel \`${j.key}\``, stop])
  return stop
}

export function listOf(j: Join, spec: ListSpec): List {
  const id = `${spec.name}:${spec.max}:${spec.key ? String(spec.key) : ''}`
  let l = j.lists.get(id)
  if (!l) j.lists.set(id, (l = createRoot(() => ({ ...spec, box: state<unknown[]>([]) }), null)))
  return l
}

// ---- sends ----------------------------------------------------------------------------------------------------------

const ACK_WAIT = 10_000
const acks = new Map<number, { ok: () => void; no: (e: unknown) => void; n: number }>()
let ackId = 0

export async function post(j: Join, name: string, message: unknown): Promise<void> {
  if (!SOCKETS && !(DEV && net()))
    throw new FnError({ code: 'R024', message: "this deploy can't hold a socket: not sent" }, 503)
  if (!j.joined && !j.refused) {
    await new Promise<void>((ok) => {
      const done = () => {
        clearTimeout(t)
        j.waiting.delete(done)
        ok()
      }
      const t = setTimeout(done, ACK_WAIT)
      j.waiting.add(done)
    })
  }
  if (!j.joined)
    throw new FnError(
      {
        ...(j.refused && { code: 'R011' }),
        message: j.refused ? 'not allowed in this channel' : 'no connection: not sent',
      },
      j.refused ? 403 : 503,
    )
  const ack = ++ackId
  const p = new Promise<void>((ok, no) => {
    acks.set(ack, { ok, no, n: j.n })
  })
  send(['m', j.n, ack, name, message])
  return track(p)
}

// ---- the socket ------------------------------------------------------------------------------------------------------

/** What the server sends a channel's client: the first element says which. */
export type Frame =
  | ['h', { b?: string }]
  | ['j', number, string | undefined]
  | ['m', number, string | undefined, string, never]
  | ['r', number, string | undefined]
  | ['e', number, { code?: string; message?: string }]
  | ['a', number, number, { code?: string; message?: string } | undefined]

/** One end of a socket, as a channel holds it. */
export interface SocketLink {
  send(text: string): void
  close(): void
}

/** This tab's line on the browser's one socket (link.ts). `done` gets the close code. */
function browser(onFrame: (d: Frame) => void, closed: (code: number) => void): SocketLink {
  return openLine('c', '', (text) => onFrame(JSON.parse(text)), closed)
}

let fake: (onFrame: (d: Frame) => void, closed: (code: number) => void) => SocketLink
/** Keep the test transport resolved from the original entry. */
export function setFake(value: typeof fake) {
  fake = value
}

const BASE = 500,
  CAP = 30_000,
  PING = 20_000,
  DEAD = 45_000,
  HIDDEN = 300_000

let live: SocketLink | undefined
let open = false
let running = false
let attempt = 0
let build: string | undefined
let nudge: (() => void) | undefined
let parked = false
let hiddenAt: ReturnType<typeof setTimeout> | undefined

/** A leader tab can be hidden while a sibling is looking: `@kerf-js/start/share` says when this socket must stay. */
export const keepOpen: { stay?: (() => boolean) | undefined } = {}

const send = (f: unknown[]) => live?.send(JSON.stringify(f))
const statusAll = (s: ChannelStatus) => {
  for (const j of joins.values()) if (!j.refused) j.status.value = s
}

function enter(j: Join) {
  if (!open || !live) return
  send(['j', j.n, j.fn.$id, j.params, j.cursor])
}

export function rejoin(j: Join) {
  j.refused = false
  j.status.value = 'connecting'
  if (running) enter(j)
  else start()
}

function start() {
  if (running) return
  // a function host: no socket to dial, so say so once instead of retrying forever
  if (!SOCKETS && !(DEV && net())) return statusAll('unavailable')
  running = true
  queueMicrotask(() => void run())
}

function dispatch(j: Join, name: string, msg: never) {
  if (name === '$v') {
    for (const h of j.handles) h.value?.(msg)
    return
  }
  for (const l of j.lists.values()) {
    if (l.name !== name) continue
    const was = untrack(() => l.box.value)
    const key = l.key?.(msg)
    const at = l.key ? was.findIndex((m) => l.key!(m as never) === key) : -1
    const next = at >= 0 ? was.map((m, i) => (i === at ? msg : m)) : [...was, msg]
    l.box.value = next.length > l.max ? next.slice(-l.max) : next
  }
  for (const h of j.handles) for (const f of h.on.get(name) ?? []) f(msg)
}

function frame(d: Frame) {
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
      for (const w of Array.from(j.waiting)) w()
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
      for (const w of Array.from(j.waiting)) w()
    } else if (d[0] === 'a') {
      const p = acks.get(d[2])
      acks.delete(d[2])
      if (d[3]) p?.no(new FnError(d[3], d[3].code === 'R011' ? 403 : 400))
      else p?.ok()
    }
  })
}

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
  listen(true)
  const fakeNet = () => (DEV ? net() : undefined)
  while (joins.size) {
    if (parked || !navigator.onLine) {
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
    await new Promise<void>((done) => {
      const take = (d: Frame) => {
        alive()
        frame(d)
      }
      live = (fakeNet() ? fake : browser)(take, (c) => {
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
      p.no(
        new FnError({ message: 'the connection dropped: this may or may not have been sent' }, 503),
      )
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

/** @kerf-js/core/test, after each test. */
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
  untrack(() => {
    rt.stale.value = false
  })
}
