// Channel integrity counts.
/** What a channel has sent and received, and how late. */
export interface IntegrityStats {
  sent: number
  received: number
  duplicate: number
  outOfOrder: number
  lagP95: number
}

/** The value at the 95th percentile, 0 for none. */
export function p95(values: readonly number[]) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!
}

/** The counts DataIntegrity shows: feed it what a channel sends and receives. `receive` says what became of a seq. */
export function integrityCounter(window = 60) {
  let stats: IntegrityStats = { sent: 0, received: 0, duplicate: 0, outOfOrder: 0, lagP95: 0 }
  let lags: number[] = []
  let top = 0
  const seen = new Set<number>()
  return {
    get stats() {
      return stats
    },
    send() {
      stats = { ...stats, sent: stats.sent + 1 }
    },
    receive(seq: number, lag: number): 'ok' | 'duplicate' | 'out-of-order' {
      lags = [...lags, lag].slice(-window)
      const fate = seen.has(seq) ? 'duplicate' : seq < top ? 'out-of-order' : 'ok'
      seen.add(seq)
      top = Math.max(top, seq)
      stats = {
        ...stats,
        received: stats.received + 1,
        duplicate: stats.duplicate + (fate === 'duplicate' ? 1 : 0),
        outOfOrder: stats.outOfOrder + (fate === 'out-of-order' ? 1 : 0),
        lagP95: p95(lags),
      }
      return fate
    },
    reset() {
      stats = { sent: 0, received: 0, duplicate: 0, outOfOrder: 0, lagP95: 0 }
      lags = []
      top = 0
      seen.clear()
    },
  }
}
