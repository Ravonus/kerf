import { effect, onCleanup, untrack, type Derived, type State } from '@weft-js/core'
import type { CursorAt, Peer, PeerLink, PeerTransport } from '../index'
import { applyPeer, readCursor } from './peer'
import { hear, silent, type Conn } from './shared'

export function listenPresence<S>(
  conn: Conn,
  self: State<string | undefined>,
  ticket: State<unknown>,
  list: State<Peer<S>[]>,
  heard: Set<(id: string, at: CursorAt | null) => void>,
  signals: Set<(from: string, data: unknown) => void>,
  own: () => S | null,
  hello: () => void,
) {
  hear(conn, 'mp.you', ({ id, ticket: t }: { id: string; ticket?: unknown }) => {
    self.value = id
    ticket.value = t
  })
  hear(conn, 'mp.peer', (p: Peer<S>) => {
    if (p.id === untrack(() => self.value)) return
    // Stamped by this clock: another machine's would expire it early or never.
    list.value = applyPeer(
      untrack(() => list.value),
      { ...p, at: Date.now() },
    )
  })
  hear(conn, 'mp.gone', ({ id }: { id: string }) => {
    list.value = untrack(() => list.value).filter((p) => p.id !== id)
    for (const f of heard) f(id, null)
  })
  hear(conn, 'mp.ask', ({ id }: { id: string }) =>
    silent(conn.send('mp.answer', { to: id, state: untrack(own) })),
  )
  hear(conn, 'mp.cursor', ({ id, at }: { id: string; at: CursorAt | null }) => {
    for (const f of heard) f(id, at)
  })
  hear(conn, 'mp.signal', ({ from, data }: { from: string; data: unknown }) => {
    for (const f of signals) f(from, data)
  })
  conn.onReset(() => {
    list.value = []
    hello()
  })
}

export function openTransport(
  transport: PeerTransport,
  self: State<string | undefined>,
  ticket: State<unknown>,
  ids: Derived<string[]>,
  linked: State<PeerLink | undefined>,
  conn: Conn,
  signals: Set<(from: string, data: unknown) => void>,
  heard: Set<(id: string, at: CursorAt | null) => void>,
) {
  let link: PeerLink | undefined
  effect(
    () => [self.value, ticket.value] as const,
    ([me, t]) => {
      link?.close()
      link = undefined
      linked.value = undefined
      if (!me) return
      link = transport.open({
        self: me,
        ticket: t,
        peers: ids,
        signal: (to, data) => silent(conn.send('mp.signal', { to, data })),
        onSignal: (fn) => {
          signals.add(fn)
          return () => void signals.delete(fn)
        },
        receive(from, text) {
          const at = readCursor(text)
          if (at !== undefined && untrack(() => ids.value).includes(from))
            for (const f of heard) f(from, at)
        },
      })
      linked.value = link
    },
  )
  onCleanup(() => link?.close())
}
