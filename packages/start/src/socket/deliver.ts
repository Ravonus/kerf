import type { Hub, Ev } from '../hub'
import type { Sock, Join } from './types'
import { ASK } from './rooms'

/** Fan-out of a room's messages to one join. */
export function deliver(c: Sock, j: Join, h: Hub, ev: Ev, send: (c: Sock, out: unknown[]) => void) {
  const m = (ev.p ??= JSON.parse(ev.raw)) as {
    f?: string
    x?: 1
    t?: string
    n: string
    m: unknown
  }
  if (m.n === ASK || (m.x && m.f === c.k) || (m.t && m.t !== c.k)) return
  send(c, ['m', j.n, h.cursorOf(ev.seq), m.n, m.m])
}
