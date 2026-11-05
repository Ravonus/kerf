import { backoffCap } from './transport'
import {
  LANES,
  blocked,
  emit,
  invalid,
  later,
  logOf,
  name,
  note,
  wireOf,
  type ConnectionId,
  type SimState,
} from './sim-state'

export function connect(s: SimState, cid: ConnectionId, why = '') {
  const { rnd } = s
  const c = s.conns[cid]
  if (invalid(s)) {
    c.state = 'offline'
    c.retryAt = 0
    note(s, cid, 'Build failed · fix the bus to start')
    return
  }
  if (blocked(s, cid)) {
    c.state = 'offline'
    c.retryAt = 0
    if (s.cfg.network === 'wsblock') {
      note(s, cid, 'WebSocket upgrade blocked · no fallback in v0')
      logOf(s, name(cid), 'upgrade blocked (426), no long-poll fallback')
    } else note(s, cid, "Browser offline · retries the moment it's back")
    return
  }
  c.state = 'connecting'
  c.retryAt = 0
  note(s, cid, why)
  later(
    s,
    () => {
      if (c.state !== 'connecting') return
      if (blocked(s, cid) || invalid(s)) {
        connect(s, cid)
        emit(s)
        return
      }
      const replay = Math.floor(rnd() * 5)
      if (c.behind) {
        c.behind = false
        c.epoch++
        c.seq = 0
        note(s, cid, 'Too far behind · reset, refetched')
        logOf(s, name(cid), `reset: outside the 256-event / 60 s window, epoch → ${c.epoch}`)
      } else if (c.attempt) {
        note(s, cid, `Resumed from ${c.epoch}:${c.seq} · ${replay} replayed`)
        logOf(s, name(cid), `resumed from ${c.epoch}:${c.seq}, ${replay} replayed`)
        c.seq += replay
      } else logOf(s, name(cid), `open over ${wireOf(s, cid)}`)
      c.state = 'live'
      c.attempt = 0
      emit(s)
    },
    s.cfg.wire === 'tabs' ? 120 : 350 + rnd() * 400,
  )
}

export function drop(s: SimState, cid: ConnectionId, reason: string) {
  const { rnd, now } = s
  const c = s.conns[cid]
  if (c.state === 'offline' && !c.retryAt) return
  c.attempt++
  const cap = backoffCap(c.attempt)
  const wait = rnd() * cap
  c.state = 'reconnecting'
  c.retryAt = now() + wait * 1000
  logOf(s, name(cid), `${reason}; retry ${c.attempt} in ${wait.toFixed(1)} s (cap ${cap} s)`)
  clearTimeout(c.timer)
  c.timer = later(
    s,
    () => {
      if (c.state === 'reconnecting') {
        connect(s, cid)
        emit(s)
      }
    },
    wait * 1000,
  )
}

export function restart(s: SimState, why?: string) {
  for (const cid of ['sse', 'ws'] as const) {
    clearTimeout(s.conns[cid].timer)
    s.conns[cid].attempt = 0
    connect(s, cid, why)
  }
  for (const [k] of LANES) s.samples[k] = []
}
