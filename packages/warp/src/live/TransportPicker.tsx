import { announce, formatMs, installSweep, latencyTone, liveState, percentile, transportError, transportSim, uid, whileSeen, worstLive, type LaneId, type LiveState, type TransportBus, type TransportConfig, type TransportNetwork, type TransportPreset, type TransportWire } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack } from '@weft-js/core'
import { LiveStatus } from '../parts'
import { Button } from '../Button'
import { Select } from '../Select'
import { use } from '@weft-js/warp-core/weft'
import { G, val } from './shared'
import '../fields'
import '@weft-js/warp-core/styles/inputs/choice.css'
import '@weft-js/warp-core/styles/components/alert.css'
import '@weft-js/warp-core/styles/app/transport.css'

const WIRES: [TransportWire, string, string, string][] = [['default', 'weft default', 'SSE + WebSocket', 'One SSE (.live, stream) and one WebSocket (channel) per tab'], ['tabs', 'Tabs only', 'BroadcastChannel', "tabs.channel: this browser's tabs, no server"], ['fake', 'Fake', '@weft-js/core/test', 'In-memory pair with a network model']]
const BUSES: [TransportBus, string, string][] = [['memory', '+0 ms', 'One process. The default'], ['postgres', '+4 ms', 'LISTEN / NOTIFY'], ['redis', '+2 ms', 'Pub/sub'], ['nats', '+1 ms', 'Subjects'], ['durable-object', '+8 ms', 'Cloudflare preset only']]
const PRESETS = [{ value: 'single', label: 'Single instance' }, { value: 'multi', label: 'Multi-instance' }, { value: 'cf', label: 'Cloudflare' }]
const NETS = [{ value: 'good', label: 'Good' }, { value: 'slow', label: 'Slow (×6)' }, { value: 'lossy', label: 'Lossy (spikes, drops)' }, { value: 'wsblock', label: 'WebSocket blocked' }, { value: 'offline', label: 'Offline' }]
const LANES: [LaneId, string][] = [['live', '.live'], ['stream', 'stream'], ['channel', 'channel']]
const BARS = Array.from({ length: 20 }, (_, i) => i)

type Status = string | { value: string } | (() => string)
export interface TransportPickerProps {
  /** The real statuses to show (`.live`, `stream().status`, `channel.status`); the lanes' figures stay the sandbox's. */
  lanes?: Partial<Record<LaneId, Status>>
  bus?: TransportBus
  wire?: TransportWire
  preset?: TransportPreset
  network?: TransportNetwork
  onConfigChange?: (c: TransportConfig) => void
  title?: string
}

/**
 * TransportPicker (07 §4.7): the realtime sandbox, a dev surface, never end-user UI. It picks the wire under test and
 * the server bus (validated like the build), runs the documented behaviour under a chosen network in `transportSim`,
 * and reads lanes as the four states of §4.4, with p50 and p95 over the last 20 pings, cursors and an event log.
 */
export function TransportPicker({ lanes, bus = 'postgres', wire = 'default', preset = 'multi', network = 'good', onConfigChange, title = 'Realtime sandbox' }: TransportPickerProps) {
  const id = uid('transport')
  const start = untrack(() => ({ wire, bus, preset, network }))
  const sim = transportSim(start)
  const rev = state(0)
  const view = <T,>(fn: () => T) => derived(() => { void rev.value; return fn() })
  const cfg = view(() => sim.config)
  const data = view(() => sim.lanes())
  const log = view(() => sim.log)
  const fallback = derived(() => untrack(() => lanes))
  const stateOf = (k: LaneId): LiveState => {
    const given = fallback.value?.[k]
    return given !== undefined ? liveState(val(given as any)) : data.value[k].state
  }
  const worst = derived(() => worstLive(LANES.map(([k]) => stateOf(k))))
  const error = derived(() => transportError(cfg.value))
  const noServer = derived(() => cfg.value.wire !== 'default')
  const busNote = derived(() => (cfg.value.wire === 'tabs' ? 'No server: tabs only stays in this browser.' : cfg.value.wire === 'fake' ? 'No server: the fake pair runs in memory.' : ''))
  let root: HTMLDivElement | undefined

  onMount(() => {
    const off = sim.subscribe(() => { rev.value++ })
    sim.start()
    onCleanup(() => { off(); sim.destroy() })
  })
  use(whileSeen, () => root, () => ({ ms: 2000, tick: () => sim.tick() }))
  // one sentence per settled change (a lane's change is polite and once, offline assertive)
  onMount(() => {
    let said: LiveState | undefined
    let t: ReturnType<typeof setTimeout> | undefined
    const off = sim.subscribe(() => {
      const w = untrack(() => worst.value)
      if (w === said) return
      said = w
      clearTimeout(t)
      t = setTimeout(() => {
        if (!root) return
        const text = w === 'live' ? 'all lanes live' : LANES.filter(([k]) => stateOf(k) !== 'live').map(([k, n]) => `${n} ${stateOf(k)}`).join(', ')
        announce(root.ownerDocument, `Realtime sandbox: ${text}`, w === 'offline')
      }, 600)
    })
    onCleanup(() => { off(); clearTimeout(t) })
  })
  const set = (next: Partial<TransportConfig>) => { sim.configure(next); onConfigChange?.(sim.config) }
  const reset = () => { sim.reset(start); onConfigChange?.(sim.config); announce(root!.ownerDocument, 'Realtime sandbox reset') }
  const drop = () => { if (!sim.drop()) announce(root!.ownerDocument, 'Tabs only has no server connection to drop') }

  return (
    <div ref={(n: any) => (root = n)} data-scope="transport">
      <div data-part="head">
        <h4>{title}</h4>
        <LiveStatus state={worst.value} label="Realtime sandbox">{worst.value === 'live' ? 'All lanes live' : undefined}</LiveStatus>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={reset}><G name="refresh" />Reset</Button>
      </div>
      <div data-part="config">
        <fieldset data-scope="group">
          <legend>Wire under test</legend>
          <div data-part="choices" role="radiogroup" aria-label="Wire under test">
            {WIRES.map(w => (
              <label key={w[0]} data-scope="choice-card" data-sweep="">
                <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
                <input type="radio" name={`${id}-wire`} value={w[0]} checked={cfg.value.wire === w[0]} onChange={() => set({ wire: w[0] })} />
                <span data-part="label">{w[1]}</span><span data-part="meta">{w[2]}</span><span data-part="hint">{w[3]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset data-scope="group" disabled={noServer.value}>
          <legend>Server bus <code>realtime.bus</code></legend>
          <div data-part="choices" role="radiogroup" aria-label="Server bus">
            {BUSES.map(b => (
              <label key={b[0]} data-scope="choice-card" data-sweep="">
                <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
                <input type="radio" name={`${id}-bus`} value={b[0]} checked={cfg.value.bus === b[0]} disabled={b[0] === 'durable-object' && cfg.value.preset !== 'cf'} aria-describedby={`${id}-h-${b[0]}`} onChange={() => set({ bus: b[0] })} />
                <span data-part="label"><code>{b[0]}</code></span><span data-part="meta">{b[1]}</span>
                <span data-part="hint" id={`${id}-h-${b[0]}`}>{b[0] === 'durable-object' && cfg.value.preset === 'cf' ? 'One object per channel' : b[2]}</span>
              </label>
            ))}
          </div>
          <div data-part="row"><Select label="Deploy preset" options={PRESETS} value={cfg.value.preset} onChange={(e: Event) => set({ preset: (e.target as HTMLSelectElement).value as TransportPreset })} /></div>
          <span data-part="message">{busNote.value}</span>
        </fieldset>
      </div>
      {error.value && (
        <div data-scope="alert" data-tone="critical" data-part="build-error" role="alert">
          <span data-part="title">{error.value.title}</span>
          <span data-part="description">{error.value.description}</span>
        </div>
      )}
      <div data-part="row">
        <Select label="Network" options={NETS} value={cfg.value.network} onChange={(e: Event) => set({ network: (e.target as HTMLSelectElement).value as TransportNetwork })} />
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => sim.ping()}><G name="bolt" />Ping</Button>
        <Button emphasis="outline" tone="neutral" size="sm" onClick={drop}>Drop connection</Button>
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => sim.fallBehind()}>Fall behind</Button>
      </div>
      <ul data-part="lanes" aria-label="Lanes">
        {LANES.map(l => <Lane key={l[0]} name={l[1]} lane={data.value[l[0]]} status={stateOf(l[0])} />)}
      </ul>
      <div data-part="log" role="log" aria-live="off" aria-label="Event log" tabindex="0">
        <ol>{log.value.map(e => <li key={`${e.at}-${e.text}`}><span>+{e.at.toFixed(1)}s</span><b>{e.who}</b><span>{e.text}</span></li>)}</ol>
      </div>
    </div>
  )
}

function Lane({ name, lane, status }: { name: string; lane: { samples: number[]; cursor: string; wire: string; note: string }; status: LiveState }) {
  const p50 = derived(() => percentile(lane.samples, 0.5))
  const p95 = derived(() => percentile(lane.samples, 0.95))
  const bars = derived(() => BARS.map(i => {
    const x = lane.samples.slice(-20)[i - (20 - Math.min(20, lane.samples.length))]
    return { i, h: x === undefined ? 0 : Math.min(1, Math.sqrt(x / 1000)), tone: x === undefined ? undefined : latencyTone(x) }
  }))
  return (
    <li data-part="lane" data-state={status}>
      <div data-part="lane-name"><b>{name}</b><small>{lane.wire}</small></div>
      <LiveStatus state={status} />
      <dl data-part="figures">
        <div><dt>p50</dt><dd data-numeric="" data-tone={latencyTone(p50.value)}>{formatMs(p50.value)}</dd></div>
        <div><dt>p95</dt><dd data-numeric="" data-tone={latencyTone(p95.value)}>{formatMs(p95.value)}</dd></div>
        <div><dt>cursor</dt><dd data-numeric="">{lane.cursor}</dd></div>
      </dl>
      <div data-part="bars" aria-hidden="true">{bars.value.map(b => <i key={b.i} data-tone={b.tone} style={`--h:${b.h.toFixed(3)}`}></i>)}</div>
      <span data-part="note">{lane.note}</span>
    </li>
  )
}
