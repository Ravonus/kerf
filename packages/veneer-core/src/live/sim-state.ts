import type { LiveState } from './status'
import { BUS_MS, transportError, type LaneId, type TransportConfig } from './transport'

/** One lane of the simulation as it stands. */
export interface SimLane {
  state: LiveState
  samples: number[]
  cursor: string
  wire: string
  note: string
}
/** One line of the simulation's log. */
export interface SimLog {
  at: number
  who: string
  text: string
}
/** What a simulation can be given, to run under a test. */
export interface SimEnv {
  random?: () => number
  now?: () => number
  pace?: (ms: number) => number
}
export type ConnectionId = 'sse' | 'ws'
export type Conn = {
  state: LiveState
  attempt: number
  retryAt: number
  epoch: number
  seq: number
  behind: boolean
  timer?: ReturnType<typeof setTimeout>
}
export const LANES: [LaneId, string, ConnectionId][] = [
  ['live', '.live', 'sse'],
  ['stream', 'stream', 'sse'],
  ['channel', 'channel', 'ws'],
]
export interface SimState {
  rnd: () => number
  now: () => number
  pace: (ms: number) => number
  start: number
  cfg: TransportConfig
  conns: Record<ConnectionId, Conn>
  samples: Record<LaneId, number[]>
  notes: Record<LaneId, string>
  log: SimLog[]
  subs: (() => void)[]
  timers: ReturnType<typeof setTimeout>[]
}
export function createState(initial: TransportConfig, env: SimEnv): SimState {
  const rnd = env.random ?? Math.random
  const now = env.now ?? (() => performance.now())
  const pace = env.pace ?? ((ms: number) => ms)
  const start = now()
  return {
    rnd,
    now,
    pace,
    start,
    cfg: { ...initial },
    conns: {
      sse: { state: 'connecting', attempt: 0, retryAt: 0, epoch: 7, seq: 138, behind: false },
      ws: { state: 'connecting', attempt: 0, retryAt: 0, epoch: 7, seq: 52, behind: false },
    },
    samples: { live: [], stream: [], channel: [] },
    notes: { live: '', stream: '', channel: '' },
    log: [],
    subs: [],
    timers: [],
  }
}
export const emit = (s: SimState) => s.subs.forEach((fn) => fn())
export const logOf = (s: SimState, who: string, text: string) => {
  const { now, start } = s
  s.log = [...s.log, { at: (now() - start) / 1000, who, text }].slice(-40)
}
export const name = (cid: ConnectionId) => (cid === 'ws' ? 'channel' : 'sse')
export const invalid = (s: SimState) => transportError(s.cfg)
export const wireOf = (s: SimState, cid: ConnectionId) =>
  s.cfg.wire === 'tabs'
    ? 'BroadcastChannel'
    : s.cfg.wire === 'fake'
      ? '@kerf-js/core/test fake pair'
      : cid === 'sse'
        ? 'SSE · POST /_kerf/rt'
        : 'WebSocket · crossws'
export const blocked = (s: SimState, cid: ConnectionId) =>
  s.cfg.wire !== 'tabs' &&
  (s.cfg.network === 'offline' ||
    (s.cfg.network === 'wsblock' && cid === 'ws' && s.cfg.wire === 'default'))
export const note = (s: SimState, cid: ConnectionId, text: string) => {
  for (const [k, , c] of LANES) if (c === cid) s.notes[k] = text
}
export function sample(s: SimState) {
  const { rnd } = s
  if (s.cfg.wire === 'tabs') return 0.6 + rnd() * 0.8
  let base = s.cfg.wire === 'fake' ? rnd() * 2 : 20 + rnd() * 40 + BUS_MS[s.cfg.bus]
  if (s.cfg.network === 'slow') base *= 6
  if (s.cfg.network === 'lossy' && rnd() < 0.3) base += rnd() * 400 + (rnd() < 0.12 ? 700 : 0)
  return base
}
export function later(s: SimState, fn: () => void, ms: number) {
  const { pace } = s
  const t: ReturnType<typeof setTimeout> = setTimeout(() => {
    s.timers = s.timers.filter((x) => x !== t)
    fn()
  }, pace(ms))
  s.timers.push(t)
  return t
}
export const push = (s: SimState, k: LaneId, x: number) => {
  s.samples[k] = [...s.samples[k], x].slice(-20)
}
export const each = (s: SimState, fn: (cid: ConnectionId, c: Conn) => void) => {
  for (const cid of ['sse', 'ws'] as const) fn(cid, s.conns[cid])
}
