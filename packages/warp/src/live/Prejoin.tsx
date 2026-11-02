import { announce, countdownLabel, countdownParts, levelMeter, uid } from '@weft/warp-core'
import { derived, onCleanup, onMount, state, untrack } from 'weft'
import { Avatar } from '../parts'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Field'
import { Select, type Option } from '../Select'
import { Spinner } from '../Spinner'
import { use } from '@weft/warp-core/weft'
import { avatarTint, G, held } from './shared'
import '../fields'
import '@weft/warp-core/styles/app/base.css'
import '@weft/warp-core/styles/app/tile.css'
import '@weft/warp-core/styles/app/prejoin.css'

const BARS = Array.from({ length: 16 }, (_, i) => i)
export interface PrejoinDevices { mics?: Option[]; cameras?: Option[]; speakers?: Option[] }

export interface PrejoinProps {
  name?: string
  /** The preview: your own <video>. Media is the caller's; warp never touches getUserMedia. */
  preview?: () => any
  /** 0 to 1. For a 10 Hz level, set `--level` on [data-part="meter"] yourself: nothing re-renders either way. */
  level?: number
  mic?: boolean
  camera?: boolean
  onMic?: (on: boolean) => void
  onCamera?: (on: boolean) => void
  devices?: PrejoinDevices
  onDevice?: (kind: 'mic' | 'camera' | 'speaker', id: string) => void
  onTestSound?: () => void
  joining?: boolean
  joinLabel?: string
  onJoin?: (name: string) => void
}

/** Prejoin (07 §3.2): preview, 16-bar mic meter, device Selects, Join with its loading state. */
export function Prejoin({ name = '', preview, level, mic, camera, onMic, onCamera, devices, onDevice, onTestSound, joining, joinLabel = 'Join now', onJoin }: PrejoinProps) {
  const who = state(untrack(() => name))
  const micOn = held<boolean>(() => mic, true, () => onMic)
  const camOn = held<boolean>(() => camera, true, () => onCamera)
  const list = untrack(() => devices) ?? {}
  let meter: HTMLDivElement | undefined
  use(levelMeter, () => meter, () => level)
  const pick = (kind: 'mic' | 'camera' | 'speaker', e: Event) => onDevice?.(kind, (e.target as HTMLSelectElement).value)
  return (
    <div data-scope="prejoin">
      <div data-part="layout">
        <div data-part="stack">
          <div data-part="preview">
            <div data-scope="tile" data-cam={camOn.value ? undefined : 'off'}>
              {camOn.value && preview ? <div data-part="video">{preview()}</div> : <Avatar name={who.value || 'You'} size="xl" style={avatarTint(who.value)} />}
              <span data-part="name">You</span>
            </div>
            <div data-part="preview-controls">
              <Button emphasis="soft" tone="neutral" data-icon-only="" aria-pressed={micOn.value ? 'true' : 'false'} aria-label="Microphone" onClick={() => micOn.set(!micOn.value)}><G name={micOn.value ? 'mic' : 'micoff'} /></Button>
              <Button emphasis="soft" tone="neutral" data-icon-only="" aria-pressed={camOn.value ? 'true' : 'false'} aria-label="Camera" onClick={() => camOn.set(!camOn.value)}><G name={camOn.value ? 'cam' : 'camoff'} /></Button>
            </div>
          </div>
          <div ref={(n: any) => (meter = n)} data-part="meter" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="16" aria-valuenow="0" style={level === undefined ? undefined : `--level:${level}`}>
            {BARS.map(i => <i key={i}></i>)}
          </div>
        </div>
        <div data-part="stack">
          <Input label="Your name" value={who.value} autocomplete="name" onInput={e => (who.value = e.currentTarget.value)} />
          {list.mics && <Select label="Microphone" options={list.mics} onChange={e => pick('mic', e)} />}
          {list.cameras && <Select label="Camera" options={list.cameras} onChange={e => pick('camera', e)} />}
          {list.speakers && <Select label="Speakers" options={list.speakers} onChange={e => pick('speaker', e)} />}
          {onTestSound && <Button emphasis="link" size="sm" onClick={onTestSound}>Play test sound</Button>}
          <Button size="lg" full loading={!!joining} onClick={() => onJoin?.(who.value)}>{joinLabel}</Button>
        </div>
      </div>
    </div>
  )
}

/** Lobby (07 §3.2): waiting to be let in. A Spinner and "Asking to join…" as a status. */
export function Lobby({ title = 'Waiting for the host', children = "We'll chime when it's your turn.", onCancel }: { title?: any; children?: any; onCancel?: () => void }) {
  return (
    <Card eyebrow="Lobby" title={title} sweep={false}>
      <p>{children}</p>
      <p><Spinner size="sm" /> <span role="status">Asking to join…</span></p>
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => onCancel?.()}>Cancel request</Button>
    </Card>
  )
}

/**
 * Countdown (07 §3.2): role=timer, aria-live off, announced once at one minute. `to` and `now` are epoch ms: pass
 * `now` to render on the server; without it the digits fill in after mount.
 */
export function Countdown({ to, now, label = 'Starts in', onDone }: { to: number; now?: number; label?: string; onDone?: () => void }) {
  const left = state<number | null>(untrack(() => (now === undefined ? null : to - now)))
  const parts = derived(() => countdownParts(left.value ?? 0))
  const name = derived(() => (left.value === null ? label : countdownLabel(left.value)))
  let root: HTMLDivElement | undefined
  onMount(() => {
    let warned = untrack(() => left.value !== null && left.value <= 60000)
    let done = false
    const beat = () => {
      const ms = untrack(() => to) - Date.now()
      left.value = ms
      if (!warned && ms <= 60000) { warned = true; if (root) announce(root.ownerDocument, 'Starts in 1 minute') }
      if (!done && ms <= 0) { done = true; clearInterval(t); onDone?.() }
    }
    const t = setInterval(beat, 1000)
    onCleanup(() => clearInterval(t))
    queueMicrotask(beat)
  })
  return (
    <div ref={(n: any) => (root = n)} data-part="countdown" role="timer" aria-live="off" aria-label={name.value}>
      {parts.value.map(p => <span key={p.unit}><b>{p.value}</b><small>{p.unit}</small></span>)}
    </div>
  )
}

/** ScheduledLobby (07 §3.1): Countdown, with Join disabled until `joinable` or the countdown ends. */
export function ScheduledLobby({ title, children, to, now, joinable, opensAt, onJoin, onAddToCalendar }: { title: any; children?: any; to: number; now?: number; joinable?: boolean; opensAt?: string; onJoin?: () => void; onAddToCalendar?: () => void }) {
  const ended = state(false)
  const can = derived(() => !!joinable || ended.value)
  const id = uid('sched')
  return (
    <Card eyebrow="Scheduled lobby" title={title} sweep={false} aria-labelledby={undefined}>
      {children !== undefined && <p>{children}</p>}
      <Countdown to={to} now={now} onDone={() => (ended.value = true)} />
      <p>
        <Button size="sm" disabled={!can.value} aria-describedby={!can.value && opensAt ? id : undefined} onClick={() => onJoin?.()}>Join</Button>
        {onAddToCalendar && <Button emphasis="outline" tone="neutral" size="sm" onClick={onAddToCalendar}><G name="cal" />Add to calendar</Button>}
      </p>
      {opensAt && !can.value && <small id={id}>Opens at {opensAt}</small>}
    </Card>
  )
}
