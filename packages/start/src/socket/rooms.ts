import type { Hub, Ev } from '../hub'
import type { Hubbed, Room, Value } from './types'

export const VALUE = '$v',
  ASK = '$?'
const VALUES = 10_000

export function room(h: Hub, st: Hubbed, name: string, shared: boolean): Room {
  let r = st.rooms.get(name)
  if (r) return (r.refs++, r)
  const ch = h.channel(name)
  const on = (ev: Ev | null) => {
    if (!ev || !shared) return
    const m = (ev.p ??= JSON.parse(ev.raw)) as { n: string; m: never }
    if (m.n === VALUE) store(st, name, m.m)
    else if (m.n === ASK) {
      const v = st.values.get(name)
      if (v) void h.bus.publish(name, JSON.stringify({ n: VALUE, m: v }))
    }
  }
  ch.listeners.add(on)
  r = { name, ch, refs: 1, shared, on }
  st.rooms.set(name, r)
  if (shared && !st.values.has(name))
    void ch.ready.then(() => h.bus.publish(name, JSON.stringify({ n: ASK })))
  return r
}

export function leaveRoom(h: Hub, st: Hubbed, r: Room) {
  if (--r.refs) return
  st.rooms.delete(r.name)
  h.unlisten(r.ch, r.on)
}

export function store(st: Hubbed, name: string, v: Value) {
  const had = st.values.get(name)
  if (had && (had.at > v.at || (had.at === v.at && had.o >= v.o))) return
  st.values.delete(name) // last in the map: the oldest key goes first
  st.values.set(name, v)
  if (st.values.size > VALUES) st.values.delete(st.values.keys().next().value!)
}
