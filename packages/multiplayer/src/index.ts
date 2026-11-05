// Presence, cursors, a typed relay and synced scroll, on a `channel` connection (research 35). A library: nothing here
// is a plugin, and an app that doesn't import it ships none of it. The server's half is `@weft-js/multiplayer/server`.
//
//   const chat = doc.connect(() => ({ id: props.id }))
//   const room = presence(chat, { state: () => ({ typing: typing.value }) })
//   room.peers.value                      // Peer[], without this connection
//   const pointers = cursors(room)        // follows the pointer; <Cursors of={pointers} /> draws the others
//   const clicks = relay<{ ping: { at: string } }>(chat); clicks.on('ping', e => flash(e.data.at, e.peer))

import {
  derived,
  effect,
  onCleanup,
  onMount,
  state,
  untrack,
  type Derived,
  type State,
} from '@weft-js/core'
import { hear, isServer, silent, type Conn } from './index/shared'
import { listenPresence, openTransport } from './index/presence'

/** Who a peer is, from `user` on the server: never from the client. */
export interface PeerUser {
  id: string
  name?: string
  [key: string]: unknown
}
/** Someone else in the room: their connection's id, who they are, the state they share and when they were last heard. */
export interface Peer<S = unknown> {
  id: string
  user: PeerUser
  state: S
  at: number
}
/** A pointer as fractions of `a`, an anchor's id, or of the viewport without one. */
export interface CursorAt {
  a?: string
  x: number
  y: number
  style?: string
}

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

export { applyPeer, readCursor } from './index/peer'
/** The list without peers unheard for `ttl`, or the same list when nobody expired. */
export const expire = <S>(list: Peer<S>[], now: number, ttl: number): Peer<S>[] => {
  const kept = list.filter((p) => now - p.at <= ttl)
  return kept.length === list.length ? list : kept
}

/** Who else is on this connection. Announces this one, follows `state`, and expires peers that stop beating. */
export function presence<S = undefined>(conn: Conn, options: PresenceOptions<S> = {}): Presence<S> {
  const { beat = 15_000, transport } = options
  const ttl = beat * 3
  const list = state<Peer<S>[]>([])
  const self = state<string | undefined>(undefined)
  const ticket = state<unknown>(undefined)
  const own = () =>
    (typeof options.state === 'function' ? (options.state as () => S)() : options.state) ?? null
  const hello = () => silent(conn.send('mp.hello', { state: untrack(own) }))
  const ids = derived(() => list.value.map((p) => p.id))
  const heard = new Set<(id: string, at: CursorAt | null) => void>()
  const signals = new Set<(from: string, data: unknown) => void>()
  const linked = state<PeerLink | undefined>(undefined)

  listenPresence(conn, self, ticket, list, heard, signals, own, hello)

  // Open, or moved to another room: everything held is about the last one.
  effect(
    () => (conn.status.value === 'open' ? conn.room.value : undefined),
    (room, was) => {
      if (room === was) return
      list.value = []
      self.value = undefined
      if (room) hello()
    },
  )

  let first = true
  effect(
    () => own(),
    () => {
      if (first) return void (first = false)
      if (untrack(() => conn.status.value) === 'open') schedule()
    },
  )
  let queued: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    queued ??= setTimeout(() => {
      queued = undefined
      silent(conn.send('mp.state', { state: untrack(own) }))
    }, STATE_GAP)
  }

  if (typeof setInterval !== 'undefined' && !isServer()) {
    const timer = setInterval(() => {
      list.value = expire(
        untrack(() => list.value),
        Date.now(),
        ttl,
      )
      if (untrack(() => conn.status.value) === 'open')
        silent(conn.send('mp.state', { state: untrack(own) }))
    }, beat)
    onCleanup(() => {
      clearInterval(timer)
      clearTimeout(queued)
    })
  }

  if (transport) openTransport(transport, self, ticket, ids, linked, conn, signals, heard)

  return {
    peers: list,
    self,
    via: derived(() => (linked.value?.up.value ? transport!.name : 'socket')),
    connection: conn,
    link: () => {
      const l = untrack(() => linked.value)
      return l && untrack(() => l.up.value) ? l : undefined
    },
    seen: (fn) => {
      heard.add(fn)
      onCleanup(() => void heard.delete(fn))
    },
  }
}

export { cursors, hue, locate, resolve } from './index/cursors'
export type { CursorOptions, Cursors, LiveCursor } from './index/cursors'

// ---- relay ----------------------------------------------------------------------------------------------------------

/** Something a peer did, named and validated by the server, and which peer did it. */
export interface RelayEvent<D> {
  peer: string
  kind: string
  data: D
}

/** Something a peer did, delivered to a callback. Never a synthetic DOM event: the page decides what it means. */
export function relay<K extends Record<string, unknown>>(conn: Pick<Conn, 'on' | 'send'>) {
  const handlers = new Map<string, Set<(e: RelayEvent<unknown>) => void>>()
  hear(conn, 'mp.relay', ({ id, kind, data }: { id: string; kind: string; data: unknown }) => {
    for (const f of handlers.get(kind) ?? []) f({ peer: id, kind, data })
  })
  return {
    emit: <N extends keyof K & string>(kind: N, data: K[N]) =>
      conn.send('mp.relay', { kind, data }),
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
export function syncedScroll(
  box: State<number>,
  element: () => HTMLElement | Window = () => window,
) {
  onMount(() => {
    if (isServer()) return
    const el = element()
    const page = el === window
    const max = () =>
      page
        ? document.documentElement.scrollHeight - innerHeight
        : (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight
    const now = () => (page ? scrollY : (el as HTMLElement).scrollTop)
    let held = 0,
      frame = 0
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
    effect(
      () => box.value,
      (f) => {
        const top = f * max()
        if (Math.abs(top - now()) < 2) return
        held = performance.now() + 150 // what this write causes isn't the user scrolling
        el.scrollTo({ top })
      },
    )
  })
}

/** The URL hash in a shared box. */
export function syncedHash(box: State<string>) {
  onMount(() => {
    if (isServer()) return
    const on = () => {
      box.value = location.hash
    }
    addEventListener('hashchange', on)
    onCleanup(() => removeEventListener('hashchange', on))
    effect(
      () => box.value,
      (h) => {
        if (h && h !== location.hash) location.hash = h
      },
    )
  })
}
