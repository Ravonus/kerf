import type { Bus } from '../bus'
import type { Channel, Ev, Limits } from '../hub'

const VOLATILE = '{"v":1'
const unref = <T>(t: T) => ((t as { unref?(): void } | null | undefined)?.unref?.(), t)

interface Rings {
  bus: Bus
  limits: Limits
  epoch: string
  channels: Map<string, Channel>
  seq: number
}

function trim(state: Rings, ch: Channel) {
  const old = Date.now() - state.limits.window
  let drop = 0
  while (
    drop < ch.ring.length &&
    (ch.ring[drop]!.at < old || ch.ring.length - drop > state.limits.ring)
  )
    drop++
  if (!drop) return
  ch.floor = ch.ring[drop - 1]!.seq
  ch.ring.splice(0, drop)
}

function channel(state: Rings, name: string): Channel {
  const { channels, bus } = state
  const ch = channels.get(name)
  if (ch) {
    clearTimeout(ch.idle)
    ch.idle = undefined
    return ch
  }
  const made: Channel = {
    name,
    ring: [],
    floor: state.seq,
    listeners: new Set(),
    got: undefined as never,
    ready: undefined as never,
  }
  channels.set(name, made)
  made.got = (raw) => {
    const ev = { seq: ++state.seq, at: Date.now(), raw }
    // Cursors and presence beats are only worth having now: in the ring they'd push out what a resume needs.
    if (!raw.startsWith(VOLATILE)) {
      made.ring.push(ev)
      trim(state, made)
    }
    for (const on of made.listeners) on(ev)
  }
  made.ready = bus
    .subscribe(name, made.got, () => {
      made.ring.length = 0
      made.floor = state.seq
      for (const on of made.listeners) on(null)
    })
    .then(
      (stop) => {
        made.stop = stop
        made.floor = state.seq
      },
      (e) => {
        channels.delete(name)
        throw e
      },
    )
  made.ready.catch(() => {})
  return made
}

function unlisten(state: Rings, ch: Channel, on: (ev: Ev | null) => void) {
  ch.listeners.delete(on)
  if (ch.listeners.size || ch.idle) return
  ch.idle = unref(
    setTimeout(() => {
      ch.stop?.()
      state.channels.delete(ch.name)
    }, state.limits.window),
  )
}

function replay(state: Rings, ch: Channel, after: string): Ev[] | undefined {
  const [e, n] = after.split(':')
  const at = Number(n)
  trim(state, ch)
  if (e !== state.epoch || !(at >= ch.floor)) return undefined
  return ch.ring.filter((ev) => ev.seq > at)
}

export function createChannels(bus: Bus, limits: Limits, epoch: string) {
  const state: Rings = { bus, limits, epoch, channels: new Map(), seq: 0 }
  return {
    channels: state.channels,
    seq: () => state.seq,
    channel: (name: string) => channel(state, name),
    unlisten: (ch: Channel, on: (ev: Ev | null) => void) => unlisten(state, ch, on),
    replay: (ch: Channel, after: string) => replay(state, ch, after),
  }
}
