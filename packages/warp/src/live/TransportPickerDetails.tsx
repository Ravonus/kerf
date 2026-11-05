import {
  formatMs,
  latencyTone,
  percentile,
  type LiveState,
  type TransportConfig,
  type TransportNetwork,
  type transportSim,
} from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { LiveStatus } from '../parts'
import { Button } from '../Button'
import { Select } from '../Select'
import { G } from './shared'

const NETS = [
  { value: 'good', label: 'Good' },
  { value: 'slow', label: 'Slow (×6)' },
  { value: 'lossy', label: 'Lossy (spikes, drops)' },
  { value: 'wsblock', label: 'WebSocket blocked' },
  { value: 'offline', label: 'Offline' },
]
const BARS = Array.from({ length: 20 }, (_, i) => i)

export function TransportNetworkControls({
  cfg,
  sim,
  set,
  drop,
}: {
  cfg: TransportConfig
  sim: ReturnType<typeof transportSim>
  set: (next: Partial<TransportConfig>) => void
  drop: () => void
}) {
  return (
    <div data-part="row">
      <Select
        label="Network"
        options={NETS}
        value={cfg.network}
        onChange={(e: Event) =>
          set({ network: (e.target as HTMLSelectElement).value as TransportNetwork })
        }
      />
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => sim.ping()}>
        <G name="bolt" />
        Ping
      </Button>
      <Button emphasis="outline" tone="neutral" size="sm" onClick={drop}>
        Drop connection
      </Button>
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => sim.fallBehind()}>
        Fall behind
      </Button>
    </div>
  )
}

export function TransportLog({ log }: { log: ReturnType<typeof transportSim>['log'] }) {
  return (
    <div data-part="log" role="log" aria-live="off" aria-label="Event log" tabindex="0">
      <ol>
        {log.map((e) => (
          <li key={`${e.at}-${e.text}`}>
            <span>+{e.at.toFixed(1)}s</span>
            <b>{e.who}</b>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Lane({
  name,
  lane,
  status,
}: {
  name: string
  lane: { samples: number[]; cursor: string; wire: string; note: string }
  status: LiveState
}) {
  const p50 = derived(() => percentile(lane.samples, 0.5))
  const p95 = derived(() => percentile(lane.samples, 0.95))
  const bars = derived(() =>
    BARS.map((i) => {
      const x = lane.samples.slice(-20)[i - (20 - Math.min(20, lane.samples.length))]
      return {
        i,
        h: x === undefined ? 0 : Math.min(1, Math.sqrt(x / 1000)),
        tone: x === undefined ? undefined : latencyTone(x),
      }
    }),
  )
  return (
    <li data-part="lane" data-state={status}>
      <div data-part="lane-name">
        <b>{name}</b>
        <small>{lane.wire}</small>
      </div>
      <LiveStatus state={status} />
      <dl data-part="figures">
        <div>
          <dt>p50</dt>
          <dd data-numeric="" data-tone={latencyTone(p50.value!)}>
            {formatMs(p50.value!)}
          </dd>
        </div>
        <div>
          <dt>p95</dt>
          <dd data-numeric="" data-tone={latencyTone(p95.value!)}>
            {formatMs(p95.value!)}
          </dd>
        </div>
        <div>
          <dt>cursor</dt>
          <dd data-numeric="">{lane.cursor}</dd>
        </div>
      </dl>
      <div data-part="bars" aria-hidden="true">
        {bars.value.map((b) => (
          <i key={b.i} data-tone={b.tone} style={`--h:${b.h.toFixed(3)}`}></i>
        ))}
      </div>
      <span data-part="note">{lane.note}</span>
    </li>
  )
}
