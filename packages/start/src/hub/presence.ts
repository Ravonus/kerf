import type { Poke } from '../changes'
import type { Channel, Conn, Ev } from './types'

interface Dependencies {
  channels: Map<string, Channel>
  channel: (name: string) => Channel
  conns: Map<string, Conn>
  watchers: Set<(tags: string[]) => void>
  cursorOf: (n: number) => string
  seq: () => number
  poke: (c: Conn, tags: string[], at: number) => void
  replay: (ch: Channel, after: string) => Ev[] | undefined
  heartbeat: () => void
}

/** Listens from the first realtime use on, not from boot: `kerf build` loads this with no bus to reach. */
function pokes(deps: Dependencies): Channel {
  const { channels, channel, conns, cursorOf, seq, poke, watchers, heartbeat } = deps
  const had = channels.get('kerf:poke')
  if (had) return had
  const ch = channel('kerf:poke')
  ch.listeners.add((ev) => {
    if (!ev) {
      for (const c of conns.values()) c.sink.write('R', JSON.stringify({ c: cursorOf(seq()) }))
      return
    }
    const m = JSON.parse(ev.raw) as Poke & { o?: string; b?: 1 }
    if (m.b) {
      // an external listener's heartbeat
      return heartbeat()
    }
    for (const c of conns.values()) if (c.k !== m.o) poke(c, picked(c, m), ev.seq)
    for (const w of watchers) w(m.t)
  })
  return ch
}

/** What this connection subscribed to. `k`: a mutation's poke already reaches a subscription with one of these tags. */
function picked(c: Conn, { t, p, k }: Poke) {
  if (!p && !k) return t.filter((x) => c.tags.has(x))
  const out = new Set<string>()
  for (const s of c.subs.values()) {
    if (k && s.tags.some((x) => k.includes(x))) continue
    for (const x of s.tags) if (t.includes(x) || p?.some((pre) => x.startsWith(pre))) out.add(x)
  }
  return [...out]
}

function replayPokes(deps: Dependencies, c: Conn, after: string) {
  const { replay, poke, cursorOf, seq } = deps
  const list = replay(pokes(deps), after)
  if (!list) return c.sink.write('R', JSON.stringify({ c: cursorOf(seq()) }))
  for (const ev of list) {
    const m = JSON.parse(ev.raw) as Poke & { o?: string }
    if (m.o !== c.k) poke(c, picked(c, m), ev.seq)
  }
}

export function createPresence(deps: Dependencies) {
  return {
    pokes: () => pokes(deps),
    replayPokes: (c: Conn, after: string) => replayPokes(deps, c, after),
  }
}
