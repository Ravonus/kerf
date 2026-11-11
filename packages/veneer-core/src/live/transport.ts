// -- transport picker (07 §4.7) ----------------------------------------------------------------------------------------

/** How the demo transport reaches the browser. */
export type TransportWire = 'default' | 'tabs' | 'fake'
/** The bus a demo transport fans out over. */
export type TransportBus = 'memory' | 'postgres' | 'redis' | 'nats' | 'durable-object'
/** A named set of transport settings. */
export type TransportPreset = 'single' | 'multi' | 'cf'
/** The network conditions the demo simulates. */
export type TransportNetwork = 'good' | 'slow' | 'lossy' | 'wsblock' | 'offline'
/** The three kinds of live data in the demo. */
export type LaneId = 'live' | 'stream' | 'channel'
/** The transport a simulation runs. */
export interface TransportConfig {
  wire: TransportWire
  bus: TransportBus
  preset: TransportPreset
  network: TransportNetwork
}

/** The latency each bus adds, in ms. */
export const BUS_MS: Record<TransportBus, number> = {
  memory: 0,
  postgres: 4,
  redis: 2,
  nats: 1,
  'durable-object': 8,
}

/** The build's own check (07 §4.7): null when the pair is valid. */
export function transportError(c: Pick<TransportConfig, 'wire' | 'bus' | 'preset'>) {
  if (c.wire !== 'default') return null
  if (c.bus === 'memory' && c.preset === 'multi')
    return {
      title: 'R002 · memory bus on a multi-instance preset',
      description: 'Each instance would only see its own events. Use postgres, redis or nats.',
    }
  return null
}

/** Nearest-rank percentile; null on no samples. */
export function percentile(xs: readonly number[], p: number) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
/** The tone for a latency: slow and very slow only. */
export const latencyTone = (ms: number | null) =>
  ms === null ? undefined : ms >= 1000 ? 'critical' : ms >= 250 ? 'caution' : undefined
/** A latency in ms, a dash when unknown. */
export const formatMs = (ms: number | null) =>
  ms === null ? '—' : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`
/** Full-jitter backoff: attempt n waits a random time up to min(30 s, 0.5 s × 2ⁿ). */
export const backoffCap = (attempt: number) => Math.min(30, 0.5 * 2 ** attempt)
