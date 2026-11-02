// Presence, cursors, a typed relay and synced scroll, on a `channel` connection (research 35). A library: nothing here
// is a plugin, and an app that doesn't import it ships none of it. The server's half is `@weft-js/multiplayer/server`.
//
//   const chat = doc.connect(() => ({ id: props.id }))
//   const room = presence(chat, { state: () => ({ typing: typing.value }) })
//   room.peers.value                      // Peer[], without this connection
//   const pointers = cursors(room)        // follows the pointer; <Cursors of={pointers} /> draws the others
//   const clicks = relay<{ ping: { at: string } }>(chat); clicks.on('ping', e => flash(e.data.at, e.peer))

import { derived, effect, onCleanup, onMount, state, untrack, type Derived, type State } from '@weft-js/core'
import type { Connection } from '@weft-js/start'

/** Who a peer is, from `user` on the server: never from the client. */
export interface PeerUser { id: string; name?: string; [key: string]: unknown }
/** Someone else in the room: their connection's id, who they are, the state they share and when they were last heard. */
export interface Peer<S = unknown> { id: string; user: PeerUser; state: S; at: number }
/** A pointer as fractions of `a`, an anchor's id, or of the viewport without one. */
export interface CursorAt { a?: string; x: number; y: number; style?: string }

// What `presence` needs of a connection: the `mp.*` names are the fragment's, which a `doc.connect()`'s types don't say.
type Conn = Pick<Connection<unknown, unknown>, 'status' | 'room' | 'onReset'> & {
  on(name: string, fn: (message: unknown) => void): () => void
  send(name: string, message: unknown): Promise<void>
}
/** One of the fragment's messages, whose shape the server's half decides. */
const hear = <M,>(conn: Pick<Conn, 'on'>, name: string, fn: (message: M) => void) => conn.on(name, fn as (message: unknown) => void)

/** What a transport pack is handed to carry cursors around the server (`@weft-js/realtime-webrtc`, `-livekit`, `-socketio`). */
export interface PeerRoom {
  /** This connection, as the server named it. */
  readonly self: string
  /** From `ticket` in `multiplayer()`. */
  readonly ticket: unknown
  /** Who else is here, by connection. */
  readonly peers: Derived<string[]>
  /** A frame to one peer through the server, stamped with who sent it. For offers and candidates. */
  signal(to: string, data: unknown): void
  onSignal(fn: (from: string, data: unknown) => void): () => void
  /** A frame arrived. `from` has to be one the transport proved, and the frame is checked again here. */
  receive(from: string, text: string): void
}

/** An open transport, as `open` returns it. */
export interface PeerLink {
  /** True while a `send` reaches every peer. Until then frames go through the server, so nothing waits on it. */
  readonly up: Derived<boolean>
  send(text: string): void
  close(): void
}

/** A way to carry cursors around the server: what `webrtc()`, `livekit()` and `socketio()` return. */
export interface PeerTransport {
  readonly name: string
  open(room: PeerRoom): PeerLink
}

/** Options of `presence()`. */
export interface PresenceOptions<S> {
  /** This connection's own state. A function is followed. Say what's small: it goes to everyone on every change. */
  state?: S | (() => S)
  /** Ms between heartbeats. Default 15000, and peers expire after three missed. */
  beat?: number
  /** Carries cursors between peers, with the socket as the fallback. */
  transport?: PeerTransport
}

/** What `presence()` returns: who else is in the room, kept current. */
export interface Presence<S> {
  /** Everyone else here, oldest first. */
  readonly peers: Derived<Peer<S>[]>
  /** This connection, once the server has said. */
  readonly self: Derived<string | undefined>
  /** Which way cursors are going: `socket`, or the transport's name. */
  readonly via: Derived<string>
  readonly connection: Conn
  /** @internal */ readonly link: () => PeerLink | undefined
  /** @internal */ readonly seen: (fn: (id: string, at: CursorAt | null) => void) => void
}

const STATE_GAP = 50

/** Roster logic with no DOM and no timers of its own, so a test can drive it. */
export const applyPeer = <S,>(list: Peer<S>[], p: Peer<S>): Peer<S>[] => (list.some(x => x.id === p.id) ? list.map(x => (x.id === p.id ? p : x)) : [...list, p])
/** The list without peers unheard for `ttl`, or the same list when nobody expired. */
export const expire = <S,>(list: Peer<S>[], now: number, ttl: number): Peer<S>[] => { const kept = list.filter(p => now - p.at <= ttl); return kept.length === list.length ? list : kept }

const silent = (p: Promise<unknown>) => void p.catch(() => {}) // a volatile message: the next one replaces it

/** Who else is on this connection. Announces this one, follows `state`, and expires peers that stop beating. */
export function presence<S = undefined>(conn: Conn, options: PresenceOptions<S> = {}): Presence<S> {
  const { beat = 15_000, transport } = options
  const ttl = beat * 3
  const list = state<Peer<S>[]>([])
  const self = state<string | undefined>(undefined)
  const ticket = state<unknown>(undefined)
  const own = () => (typeof options.state === 'function' ? (options.state as () => S)() : options.state) ?? null
  const hello = () => silent(conn.send('mp.hello', { state: untrack(own) }))
  const ids = derived(() => list.value.map(p => p.id))
  const heard = new Set<(id: string, at: CursorAt | null) => void>()
  const signals = new Set<(from: string, data: unknown) => void>()
  let link: PeerLink | undefined
  const linked = state<PeerLink | undefined>(undefined)

  hear(conn, 'mp.you', ({ id, ticket: t }: { id: string; ticket?: unknown }) => {
    self.value = id
    ticket.value = t
  })
  hear(conn, 'mp.peer', (p: Peer<S>) => {
    if (p.id === untrack(() => self.value)) return
    // Stamped by this clock: another machine's would expire it early or never.
    list.value = applyPeer(untrack(() => list.value), { ...p, at: Date.now() })
  })
  hear(conn, 'mp.gone', ({ id }: { id: string }) => {
    list.value = untrack(() => list.value).filter(p => p.id !== id)
    for (const f of heard) f(id, null)
  })
  hear(conn, 'mp.ask', ({ id }: { id: string }) => silent(conn.send('mp.answer', { to: id, state: untrack(own) })))
  hear(conn, 'mp.cursor', ({ id, at }: { id: string; at: CursorAt | null }) => { for (const f of heard) f(id, at) })
  hear(conn, 'mp.signal', ({ from, data }: { from: string; data: unknown }) => { for (const f of signals) f(from, data) })
  conn.onReset(() => {
    list.value = []
    hello()
  })

  // Open, or moved to another room: everything held is about the last one.
  effect(() => (conn.status.value === 'open' ? conn.room.value : undefined), (room, was) => {
    if (room === was) return
    list.value = []
    self.value = undefined
    if (room) hello()
  })

  let first = true
  effect(() => own(), () => {
    if (first) return void (first = false)
    if (untrack(() => conn.status.value) === 'open') schedule()
  })
  let queued: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    queued ??= setTimeout(() => {
      queued = undefined
      silent(conn.send('mp.state', { state: untrack(own) }))
    }, STATE_GAP)
  }

  if (typeof setInterval !== 'undefined' && !isServer()) {
    const timer = setInterval(() => {
      list.value = expire(untrack(() => list.value), Date.now(), ttl)
      if (untrack(() => conn.status.value) === 'open') silent(conn.send('mp.state', { state: untrack(own) }))
    }, beat)
    onCleanup(() => {
      clearInterval(timer)
      clearTimeout(queued)
    })
  }

  if (transport) {
    effect(() => [self.value, ticket.value] as const, ([me, t]) => {
      link?.close()
      link = undefined
      linked.value = undefined
      if (!me) return
      link = transport.open({
        self: me,
        ticket: t,
        peers: ids,
        signal: (to, data) => silent(conn.send('mp.signal', { to, data })),
        onSignal: fn => { signals.add(fn); return () => void signals.delete(fn) },
        receive(from, text) {
          const at = readCursor(text)
          if (at !== undefined && untrack(() => ids.value).includes(from)) for (const f of heard) f(from, at)
        },
      })
      linked.value = link
    })
    onCleanup(() => link?.close())
  }

  return {
    peers: list,
    self,
    via: derived(() => (linked.value?.up.value ? transport!.name : 'socket')),
    connection: conn,
    link: () => { const l = untrack(() => linked.value); return l && untrack(() => l.up.value) ? l : undefined },
    seen: fn => { heard.add(fn); onCleanup(() => void heard.delete(fn)) },
  }
}

const isServer = () => typeof document === 'undefined'

/** A frame off a transport: no server looked at it, so it's read as hostile. Undefined is refused. */
export function readCursor(text: string): CursorAt | null | undefined {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return undefined }
  if (parsed === null) return null
  if (typeof parsed !== 'object') return undefined
  const v = parsed as Record<string, unknown>
  const unit = (n: unknown): n is number => typeof n === 'number' && n >= -0.5 && n <= 1.5
  if (!unit(v.x) || !unit(v.y)) return undefined
  if (v.a !== undefined && (typeof v.a !== 'string' || v.a.length > 128)) return undefined
  return { x: v.x, y: v.y, ...(typeof v.a === 'string' ? { a: v.a } : {}), ...(typeof v.style === 'string' && v.style.length <= 16 ? { style: v.style } : {}) }
}

// ---- cursors --------------------------------------------------------------------------------------------------------

/** Options of `cursors()`. */
export interface CursorOptions {
  /** What a position is measured from. An element's id, in this attribute, on both sides. Default `data-anchor`. */
  anchor?: string
  /** Sends a second. Default 12, which keeps a socket under its default 20 a second with room for everything else. */
  rate?: number
  /** Ms before a still cursor fades. Default 5000. */
  idle?: number
  /** Where the pointer is followed. Default the document. */
  root?: () => HTMLElement | Document
  style?: string
}

/** One other cursor, placed on this screen. `peer` is missing until their presence arrives. */
export interface LiveCursor<S = unknown> { id: string; peer?: Peer<S> | undefined; at: CursorAt; left: number; top: number; moved: number; idle: boolean }
/** What `cursors()` returns, for `<Cursors of={…} />`. */
export interface Cursors<S = unknown> { readonly list: Derived<LiveCursor<S>[]>; readonly anchor: string }

/** Where a local pointer is, relative to the nearest anchor, or the viewport without one. Pure but for reading layout. */
export function locate(target: Element | null, x: number, y: number, attr = 'data-anchor', view = { width: innerWidth, height: innerHeight }): CursorAt {
  const el = target?.closest?.(`[${attr}]`) as HTMLElement | null | undefined
  if (el) {
    const r = el.getBoundingClientRect()
    const w = Math.max(el.scrollWidth, r.width) || 1, h = Math.max(el.scrollHeight, r.height) || 1
    return { a: el.getAttribute(attr)!, x: (x - r.left + el.scrollLeft) / w, y: (y - r.top + el.scrollTop) / h }
  }
  return { x: x / view.width, y: y / view.height }
}

/** The same spot on this screen. Null when the anchor isn't here: a cursor at (0,0) would be a lie. */
export function resolve(at: CursorAt, attr = 'data-anchor', view = { width: innerWidth, height: innerHeight }): { left: number; top: number } | null {
  if (!at.a) return { left: at.x * view.width, top: at.y * view.height }
  const el = document.querySelector<HTMLElement>(`[${attr}="${CSS.escape(at.a)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left + at.x * Math.max(el.scrollWidth, r.width) - el.scrollLeft, top: r.top + at.y * Math.max(el.scrollHeight, r.height) - el.scrollTop }
}

/** Sends this pointer, latest wins, and tracks everyone else's. Sending and the page's own events stop with the owner. */
export function cursors<S>(room: Presence<S>, options: CursorOptions = {}): Cursors<S> {
  const { anchor = 'data-anchor', rate = 12, idle = 5000, root, style } = options
  const gap = 1000 / rate
  const raw = state<Record<string, { at: CursorAt; moved: number }>>({})
  const layout = state(0)
  const clock = state(0)
  const send = (at: CursorAt | null) => {
    const link = room.link()
    if (link) link.send(JSON.stringify(at))
    else silent(room.connection.send('mp.cursor', at))
  }
  room.seen((id, at) => {
    const { [id]: _, ...rest } = untrack(() => raw.value)
    raw.value = at ? { ...rest, [id]: { at, moved: Date.now() } } : rest
  })

  onMount(() => {
    if (isServer()) return
    const host = root?.() ?? document
    let last = 0, waiting: ReturnType<typeof setTimeout> | undefined, next: CursorAt | null | undefined
    const flush = () => {
      waiting = undefined
      if (next === undefined) return
      last = performance.now()
      send(next)
      next = undefined
    }
    const put = (at: CursorAt | null) => {
      next = at
      const wait = gap - (performance.now() - last)
      if (wait <= 0) flush()
      else waiting ??= setTimeout(flush, wait)
    }
    const move = (e: Event) => {
      const p = e as PointerEvent
      put({ ...locate(p.target as Element, p.clientX, p.clientY, anchor), ...(style ? { style } : {}) })
    }
    const out = () => put(null)
    let frame = 0
    const moved = () => { frame ||= requestAnimationFrame(() => { frame = 0; layout.value++ }) }
    host.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', out)
    addEventListener('scroll', moved, { passive: true, capture: true })
    addEventListener('resize', moved)
    const tick = setInterval(() => { clock.value = Date.now() }, 1000)
    onCleanup(() => {
      host.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', out)
      removeEventListener('scroll', moved, { capture: true })
      removeEventListener('resize', moved)
      clearInterval(tick)
      clearTimeout(waiting)
      cancelAnimationFrame(frame)
    })
  })

  const list = derived(() => {
    void layout.value
    const now = clock.value || Date.now()
    const peers = room.peers.value
    const out: LiveCursor<S>[] = []
    for (const [id, { at, moved }] of Object.entries(raw.value)) {
      const spot = resolve(at, anchor)
      if (spot) out.push({ id, peer: peers.find(p => p.id === id), at, ...spot, moved, idle: now - moved > idle })
    }
    return out
  })
  return { list, anchor }
}

/** A peer's colour, the same for them everywhere. */
export function hue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

// ---- relay ----------------------------------------------------------------------------------------------------------

/** Something a peer did, named and validated by the server, and which peer did it. */
export interface RelayEvent<D> { peer: string; kind: string; data: D }

/** Something a peer did, delivered to a callback. Never a synthetic DOM event: the page decides what it means. */
export function relay<K extends Record<string, unknown>>(conn: Pick<Conn, 'on' | 'send'>) {
  const handlers = new Map<string, Set<(e: RelayEvent<unknown>) => void>>()
  hear(conn, 'mp.relay', ({ id, kind, data }: { id: string; kind: string; data: unknown }) => { for (const f of handlers.get(kind) ?? []) f({ peer: id, kind, data }) })
  return {
    emit: <N extends keyof K & string>(kind: N, data: K[N]) => conn.send('mp.relay', { kind, data }),
    on<N extends keyof K & string>(kind: N, fn: (e: RelayEvent<K[N]>) => void) {
      const set = handlers.get(kind) ?? new Set()
      handlers.set(kind, set)
      const handler = fn as (e: RelayEvent<unknown>) => void // the server checked `data` against this kind's schema
      set.add(handler)
      const stop = () => void set.delete(handler)
      onCleanup(stop)
      return stop
    },
  }
}

// ---- synced scroll and hash: the box, not the DOM ------------------------------------------------------

/** One scroll position in a shared box, as a fraction, so different heights land on the same place. */
export function syncedScroll(box: State<number>, element: () => HTMLElement | Window = () => window) {
  onMount(() => {
    if (isServer()) return
    const el = element()
    const page = el === window
    const max = () => (page ? document.documentElement.scrollHeight - innerHeight : (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight)
    const now = () => (page ? scrollY : (el as HTMLElement).scrollTop)
    let held = 0, frame = 0
    const on = () => {
      if (performance.now() < held) return
      frame ||= requestAnimationFrame(() => {
        frame = 0
        const m = max()
        if (m > 0) box.value = Math.round((now() / m) * 10_000) / 10_000
      })
    }
    el.addEventListener('scroll', on, { passive: true })
    onCleanup(() => {
      el.removeEventListener('scroll', on)
      cancelAnimationFrame(frame)
    })
    effect(() => box.value, f => {
      const top = f * max()
      if (Math.abs(top - now()) < 2) return
      held = performance.now() + 150 // what this write causes isn't the user scrolling
      el.scrollTo({ top })
    })
  })
}

/** The URL hash in a shared box. */
export function syncedHash(box: State<string>) {
  onMount(() => {
    if (isServer()) return
    const on = () => { box.value = location.hash }
    addEventListener('hashchange', on)
    onCleanup(() => removeEventListener('hashchange', on))
    effect(() => box.value, h => { if (h && h !== location.hash) location.hash = h })
  })
}
