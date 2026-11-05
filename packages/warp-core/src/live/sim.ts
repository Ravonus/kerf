import { formatMs, type LaneId, type TransportConfig } from './transport'
import { connect, drop, restart } from './sim-connections'
import {
  LANES,
  blocked,
  createState,
  each,
  emit,
  invalid,
  logOf,
  push,
  sample,
  wireOf,
  type SimEnv,
  type SimLane,
  type SimState,
} from './sim-state'
export type { SimEnv, SimLane, SimLog } from './sim-state'

function view(s: SimState) {
  return {
    get config() {
      return s.cfg
    },
    get log() {
      return s.log
    },
    lanes(): Record<LaneId, SimLane> {
      const { now } = s
      const at = now()
      const lane = ([k, , cid]: (typeof LANES)[number]): SimLane => {
        const c = s.conns[cid]
        const via =
          cid === 'sse' && s.cfg.wire === 'default'
            ? k === 'live'
              ? ' · poke + refetch'
              : ' · shared'
            : ''
        return {
          state: c.state,
          samples: s.samples[k],
          wire: wireOf(s, cid) + via,
          cursor:
            s.cfg.wire === 'default' ? `${c.epoch}:${c.seq + (k === 'stream' ? 3 : 0)}` : 'n/a',
          note:
            c.state === 'reconnecting' && c.retryAt
              ? `Retry ${c.attempt} in ${Math.max(0, (c.retryAt - at) / 1000).toFixed(1)} s`
              : s.notes[k],
        }
      }
      return { live: lane(LANES[0]!), stream: lane(LANES[1]!), channel: lane(LANES[2]!) }
    },
  }
}

function controls(s: SimState) {
  return {
    start() {
      restart(s)
      emit(s)
    },
    configure(next: Partial<TransportConfig>) {
      const was = s.cfg
      s.cfg = { ...s.cfg, ...next }
      if (s.cfg.bus === 'durable-object' && s.cfg.preset !== 'cf') {
        s.cfg.bus = 'postgres'
        logOf(s, 'config', 'durable-object needs Cloudflare; bus → postgres')
      }
      if (next.wire !== undefined && next.wire !== was.wire)
        logOf(s, 'config', `wire → ${s.cfg.wire}`)
      if (next.bus !== undefined && next.bus !== was.bus)
        logOf(s, 'config', `realtime.bus → ${s.cfg.bus}`)
      if (next.preset !== undefined && next.preset !== was.preset)
        logOf(s, 'config', `preset → ${s.cfg.preset}`)
      if (next.network !== undefined && next.network !== was.network) {
        logOf(s, 'network', s.cfg.network)
        each(s, (cid, c) => {
          if (c.state === 'live' && !blocked(s, cid)) return
          clearTimeout(c.timer)
          if (!blocked(s, cid) && c.state === 'offline' && !invalid(s))
            c.attempt = Math.max(1, c.attempt)
          connect(s, cid)
        })
      } else restart(s)
      emit(s)
    },
    ping() {
      for (const [k, n, cid] of LANES) {
        if (s.conns[cid].state !== 'live') {
          logOf(s, n, `ping skipped: ${s.conns[cid].state}`)
          continue
        }
        const x = sample(s)
        push(s, k, x)
        logOf(s, n, `ping ${formatMs(x)}`)
      }
      emit(s)
    },
    /** False when there is nothing to drop (tabs only has no server connection). */
    drop() {
      if (s.cfg.wire === 'tabs') {
        logOf(s, 'tabs', 'nothing to drop: no server connection')
        emit(s)
        return false
      }
      each(s, (cid, c) => {
        if (c.state === 'live') drop(s, cid, 'connection dropped')
      })
      emit(s)
      return true
    },
  }
}

function lifecycle(s: SimState) {
  return {
    fallBehind() {
      if (s.cfg.wire !== 'default') {
        logOf(s, 'config', "cursors only exist on weft's default wires")
        emit(s)
        return
      }
      each(s, (_, c) => {
        c.behind = true
      })
      logOf(s, 'sim', 'missed > 256 events while away')
      each(s, (cid, c) => {
        if (c.state === 'live') drop(s, cid, 'connection dropped after a long sleep')
      })
      emit(s)
    },
    reset(next: TransportConfig) {
      s.cfg = { ...next }
      s.log = []
      logOf(s, 'config', 'reset')
      restart(s)
      emit(s)
    },
    tick() {
      const { rnd } = s
      for (const [k, , cid] of LANES) if (s.conns[cid].state === 'live') push(s, k, sample(s))
      each(s, (cid, c) => {
        if (c.state !== 'live') return
        c.seq += Math.floor(rnd() * 3)
        if (s.cfg.network === 'lossy' && s.cfg.wire !== 'tabs' && rnd() < 0.1)
          drop(s, cid, 'dropped (lossy network)')
      })
      emit(s)
    },
    subscribe(fn: () => void) {
      s.subs.push(fn)
      return () => {
        s.subs = s.subs.filter((sub) => sub !== fn)
      }
    },
    destroy() {
      s.timers.forEach(clearTimeout)
      s.timers = []
      s.subs = []
    },
  }
}

/**
 * The sandbox's model of weft's wires (07 §4.7): no real connection, the documented behaviour under a chosen network.
 * States, backoff, cursors, resume and reset run on timers; `tick()` is the 2 s heartbeat, which the caller pauses
 * when the card is off screen. `subscribe` fires on every change.
 */
export function transportSim(initial: TransportConfig, env: SimEnv = {}) {
  const s = createState(initial, env)
  return Object.assign(view(s), controls(s), lifecycle(s))
}
