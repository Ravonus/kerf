import {
  announce,
  liveState,
  transportError,
  transportSim,
  uid,
  whileSeen,
  worstLive,
  type LaneId,
  type LiveState,
  type TransportBus,
  type TransportConfig,
  type TransportPreset,
  type TransportNetwork,
  type TransportWire,
} from '@kerf/veneer-core'
import { derived, onCleanup, onMount, state, untrack, type State } from '@kerf/core'
import { LiveStatus } from '../parts'
import { Button } from '../Button'
import { Select } from '../Select'
import { use } from '@kerf/veneer-core/kerf'
import { G, val } from './shared'
import { Lane, TransportLog, TransportNetworkControls } from './TransportPickerDetails'
import '../fields'
import '@kerf/veneer-core/styles/inputs/choice.css'
import '@kerf/veneer-core/styles/components/alert.css'
import '@kerf/veneer-core/styles/app/transport.css'

const WIRES: [TransportWire, string, string, string][] = [
  [
    'default',
    'kerf default',
    'SSE + WebSocket',
    'One SSE (.live, stream) and one WebSocket (channel) per tab',
  ],
  ['tabs', 'Tabs only', 'BroadcastChannel', "tabs.channel: this browser's tabs, no server"],
  ['fake', 'Fake', '@kerf/core/test', 'In-memory pair with a network model'],
]
const BUSES: [TransportBus, string, string][] = [
  ['memory', '+0 ms', 'One process. The default'],
  ['postgres', '+4 ms', 'LISTEN / NOTIFY'],
  ['redis', '+2 ms', 'Pub/sub'],
  ['nats', '+1 ms', 'Subjects'],
  ['durable-object', '+8 ms', 'Cloudflare preset only'],
]
const PRESETS = [
  { value: 'single', label: 'Single instance' },
  { value: 'multi', label: 'Multi-instance' },
  { value: 'cf', label: 'Cloudflare' },
]
type ConfigProps = {
  id: string
  cfg: TransportConfig
  set: (next: Partial<TransportConfig>) => void
}

function TransportWireChoices({ id, cfg, set }: ConfigProps) {
  return (
    <fieldset data-scope="group">
      <legend>Wire under test</legend>
      <div data-part="choices" role="radiogroup" aria-label="Wire under test">
        {WIRES.map((w) => (
          <label key={w[0]} data-scope="choice-card" data-sweep="">
            <span data-part="sweep-base" aria-hidden="true"></span>
            <span data-part="sweep" aria-hidden="true"></span>
            <input
              type="radio"
              name={`${id}-wire`}
              value={w[0]}
              checked={cfg.wire === w[0]}
              onChange={() => set({ wire: w[0] })}
            />
            <span data-part="label">{w[1]}</span>
            <span data-part="meta">{w[2]}</span>
            <span data-part="hint">{w[3]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function TransportBusChoices({
  id,
  cfg,
  set,
  noServer,
  busNote,
}: ConfigProps & { noServer: boolean; busNote: string }) {
  return (
    <fieldset data-scope="group" disabled={noServer}>
      <legend>
        Server bus <code>realtime.bus</code>
      </legend>
      <div data-part="choices" role="radiogroup" aria-label="Server bus">
        {BUSES.map((b) => (
          <label key={b[0]} data-scope="choice-card" data-sweep="">
            <span data-part="sweep-base" aria-hidden="true"></span>
            <span data-part="sweep" aria-hidden="true"></span>
            <input
              type="radio"
              name={`${id}-bus`}
              value={b[0]}
              checked={cfg.bus === b[0]}
              disabled={b[0] === 'durable-object' && cfg.preset !== 'cf'}
              aria-describedby={`${id}-h-${b[0]}`}
              onChange={() => set({ bus: b[0] })}
            />
            <span data-part="label">
              <code>{b[0]}</code>
            </span>
            <span data-part="meta">{b[1]}</span>
            <span data-part="hint" id={`${id}-h-${b[0]}`}>
              {b[0] === 'durable-object' && cfg.preset === 'cf' ? 'One object per channel' : b[2]}
            </span>
          </label>
        ))}
      </div>
      <div data-part="row">
        <Select
          label="Deploy preset"
          options={PRESETS}
          value={cfg.preset}
          onChange={(e: Event) =>
            set({ preset: (e.target as HTMLSelectElement).value as TransportPreset })
          }
        />
      </div>
      <span data-part="message">{busNote}</span>
    </fieldset>
  )
}

const LANES: [LaneId, string][] = [
  ['live', '.live'],
  ['stream', 'stream'],
  ['channel', 'channel'],
]

type Status = string | { value: string } | (() => string)
/** Props for TransportPicker. */
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

function transportLifecycle({
  sim,
  rev,
  root,
  worst,
  stateOf,
}: {
  sim: ReturnType<typeof transportSim>
  rev: State<number>
  root: () => HTMLDivElement | undefined
  worst: { readonly value: LiveState }
  stateOf: (k: LaneId) => LiveState
}) {
  onMount(() => {
    const off = sim.subscribe(() => {
      rev.value++
    })
    sim.start()
    onCleanup(() => {
      off()
      sim.destroy()
    })
  })
  use(whileSeen, root, () => ({ ms: 2000, tick: () => sim.tick() }))
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
        if (!root()) return
        const text =
          w === 'live'
            ? 'all lanes live'
            : LANES.filter(([k]) => stateOf(k) !== 'live')
                .map(([k, n]) => `${n} ${stateOf(k)}`)
                .join(', ')
        announce(root()!.ownerDocument, `Realtime sandbox: ${text}`, w === 'offline')
      }, 600)
    })
    onCleanup(() => {
      off()
      clearTimeout(t)
    })
  })
}

function transportActions({
  sim,
  start,
  onConfigChange,
  root,
}: {
  sim: ReturnType<typeof transportSim>
  start: TransportConfig
  onConfigChange: (read: () => TransportConfig) => void
  root: () => HTMLDivElement | undefined
}) {
  const set = (next: Partial<TransportConfig>) => {
    sim.configure(next)
    onConfigChange(() => sim.config)
  }
  const reset = () => {
    sim.reset(start)
    onConfigChange(() => sim.config)
    announce(root()!.ownerDocument, 'Realtime sandbox reset')
  }
  const drop = () => {
    if (!sim.drop()) announce(root()!.ownerDocument, 'Tabs only has no server connection to drop')
  }

  return { set, reset, drop }
}

function transportBusNote(cfg: { readonly value: TransportConfig }) {
  return derived(() =>
    cfg.value.wire === 'tabs'
      ? 'No server: tabs only stays in this browser.'
      : cfg.value.wire === 'fake'
        ? 'No server: the fake pair runs in memory.'
        : '',
  )
}

function transportView<T>(rev: State<number>, fn: () => T) {
  return derived(() => {
    void rev.value
    return fn()
  })
}

function TransportHead({
  title,
  worst,
  reset,
}: {
  title: string
  worst: LiveState
  reset: () => void
}) {
  return (
    <div data-part="head">
      <h4>{title}</h4>
      <LiveStatus state={worst} label="Realtime sandbox">
        {worst === 'live' ? 'All lanes live' : undefined}
      </LiveStatus>
      <Button emphasis="ghost" tone="neutral" size="sm" onClick={reset}>
        <G name="refresh" />
        Reset
      </Button>
    </div>
  )
}

/**
 * TransportPicker (07 §4.7): the realtime sandbox, a dev surface, never end-user UI. It picks the wire under test and
 * the server bus (validated like the build), runs the documented behaviour under a chosen network in `transportSim`,
 * and reads lanes as the four states of §4.4, with p50 and p95 over the last 20 pings, cursors and an event log.
 */
export function TransportPicker({
  lanes,
  bus = 'postgres',
  wire = 'default',
  preset = 'multi',
  network = 'good',
  onConfigChange,
  title = 'Realtime sandbox',
}: TransportPickerProps) {
  const id = uid('transport')
  const start = untrack(() => ({ wire, bus, preset, network }))
  const sim = transportSim(start)
  const rev = state(0)
  const view = <T,>(fn: () => T) => transportView(rev, fn)
  const cfg = view(() => sim.config)
  const data = view(() => sim.lanes())
  const log = view(() => sim.log)
  const fallback = derived(() => untrack(() => lanes))
  const stateOf = (k: LaneId): LiveState => {
    const given = fallback.value?.[k]
    return given !== undefined ? liveState(val<string>(given)) : data.value[k].state
  }
  const worst = derived(() => worstLive(LANES.map(([k]) => stateOf(k))))
  const error = derived(() => transportError(cfg.value))
  const noServer = derived(() => cfg.value.wire !== 'default')
  const busNote = transportBusNote(cfg)

  let root: HTMLDivElement | undefined

  transportLifecycle({ sim, rev, root: () => root, worst, stateOf })
  const { set, reset, drop } = transportActions({
    sim,
    start,
    onConfigChange: (readConfig) => onConfigChange?.(readConfig()),
    root: () => root,
  })

  return (
    <div ref={(n) => (root = n)} data-scope="transport">
      <TransportHead title={title} worst={worst.value} reset={reset} />
      <div data-part="config">
        <TransportWireChoices id={id} cfg={cfg.value} set={set} />
        <TransportBusChoices
          id={id}
          cfg={cfg.value}
          set={set}
          noServer={noServer.value}
          busNote={busNote.value}
        />
      </div>
      {error.value && (
        <div data-scope="alert" data-tone="critical" data-part="build-error" role="alert">
          <span data-part="title">{error.value.title}</span>
          <span data-part="description">{error.value.description}</span>
        </div>
      )}
      <TransportNetworkControls cfg={cfg.value} sim={sim} set={set} drop={drop} />
      <ul data-part="lanes" aria-label="Lanes">
        {LANES.map((l) => (
          <Lane key={l[0]} name={l[1]} lane={data.value[l[0]]} status={stateOf(l[0])} />
        ))}
      </ul>
      <TransportLog log={log.value} />
    </div>
  )
}
