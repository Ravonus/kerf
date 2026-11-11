import { announce, countdownLabel, countdownParts, levelMeter, uid } from '@kerf/veneer-core'
import { derived, onCleanup, onMount, state, untrack } from '@kerf/core'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Field'
import { Select, type Option } from '../Select'
import { Spinner } from '../Spinner'
import { use } from '@kerf/veneer-core/kerf'
import { G, held } from './shared'
import { PrejoinPreview } from './PrejoinPreview'
import { PrejoinMeter } from './PrejoinMeter'
import '../fields'
import '@kerf/veneer-core/styles/app/base.css'
import '@kerf/veneer-core/styles/app/tile.css'
import '@kerf/veneer-core/styles/app/prejoin.css'

/** The devices to choose from before joining. */
export interface PrejoinDevices {
  mics?: Option[]
  cameras?: Option[]
  speakers?: Option[]
}

/** Props for Prejoin. */
export interface PrejoinProps {
  name?: string | undefined
  /** The preview: your own <video>. Media is the caller's; Veneer never touches getUserMedia. */
  preview?: () => unknown
  /** 0 to 1. For a 10 Hz level, set `--level` on [data-part="meter"] yourself: nothing re-renders either way. */
  level?: number
  /** Whether your mic starts on. */
  mic?: boolean
  /** Whether your camera starts on. */
  camera?: boolean
  /** Called with the mic toggle's new state. */
  onMic?: (on: boolean) => void
  /** Called with the camera toggle's new state. */
  onCamera?: (on: boolean) => void
  devices?: PrejoinDevices
  onDevice?: (kind: 'mic' | 'camera' | 'speaker', id: string) => void
  onTestSound?: (() => void) | undefined
  joining?: boolean
  /** The join button's words. Default "Join now". */
  joinLabel?: string
  onJoin?: ((name: string) => void) | undefined
}

/** Prejoin (07 §3.2): preview, 16-bar mic meter, device Selects, Join with its loading state. */
export function Prejoin(props: PrejoinProps) {
  const who = state(untrack(() => (props.name === undefined ? '' : props.name)))
  const micOn = held<boolean>(
    () => props.mic,
    true,
    () => props.onMic,
  )
  const camOn = held<boolean>(
    () => props.camera,
    true,
    () => props.onCamera,
  )
  const list = untrack(() => props.devices) ?? {}
  let meter: HTMLDivElement | undefined
  use(
    levelMeter,
    () => meter,
    () => props.level,
  )
  const pick = (kind: 'mic' | 'camera' | 'speaker', e: Event) =>
    props.onDevice?.(kind, (e.target as HTMLSelectElement).value)
  return (
    <div data-scope="prejoin">
      <div data-part="layout">
        <div data-part="stack">
          <PrejoinPreview who={who} micOn={micOn} camOn={camOn} source={() => props} />
          <PrejoinMeter bind={(n) => (meter = n)} level={props.level} />
        </div>
        <div data-part="stack">
          <Input
            label="Your name"
            value={who.value}
            autocomplete="name"
            onInput={(e) => (who.value = e.currentTarget.value)}
          />
          {list.mics && (
            <Select label="Microphone" options={list.mics} onChange={(e) => pick('mic', e)} />
          )}
          {list.cameras && (
            <Select label="Camera" options={list.cameras} onChange={(e) => pick('camera', e)} />
          )}
          {list.speakers && (
            <Select label="Speakers" options={list.speakers} onChange={(e) => pick('speaker', e)} />
          )}
          {props.onTestSound && (
            <Button emphasis="link" size="sm" onClick={props.onTestSound}>
              Play test sound
            </Button>
          )}
          <Button
            size="lg"
            full
            loading={!!props.joining}
            onClick={() => props.onJoin?.(who.value)}
          >
            {props.joinLabel === undefined ? 'Join now' : props.joinLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Lobby (07 §3.2): waiting to be let in. A Spinner and "Asking to join…" as a status. */
export function Lobby({
  title = 'Waiting for the host',
  children = "We'll chime when it's your turn.",
  onCancel,
}: {
  title?: unknown
  children?: unknown
  onCancel?: () => void
}) {
  return (
    <Card eyebrow="Lobby" title={title} sweep={false}>
      <p>{children}</p>
      <p>
        <Spinner size="sm" /> <span role="status">Asking to join…</span>
      </p>
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => onCancel?.()}>
        Cancel request
      </Button>
    </Card>
  )
}

/**
 * Countdown (07 §3.2): role=timer, aria-live off, announced once at one minute. `to` and `now` are epoch ms: pass
 * `now` to render on the server; without it the digits fill in after mount.
 */
export function Countdown({
  to,
  now,
  label = 'Starts in',
  onDone,
}: {
  to: number
  now?: number | undefined
  label?: string | undefined
  onDone?: () => void
}) {
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
      if (!warned && ms <= 60000) {
        warned = true
        if (root) announce(root.ownerDocument, 'Starts in 1 minute')
      }
      if (!done && ms <= 0) {
        done = true
        clearInterval(t)
        onDone?.()
      }
    }
    const t = setInterval(beat, 1000)
    onCleanup(() => clearInterval(t))
    queueMicrotask(beat)
  })
  return (
    <div
      ref={(n) => (root = n)}
      data-part="countdown"
      role="timer"
      aria-live="off"
      aria-label={name.value}
    >
      {parts.value.map((p) => (
        <span key={p.unit}>
          <b>{p.value}</b>
          <small>{p.unit}</small>
        </span>
      ))}
    </div>
  )
}

/** ScheduledLobby (07 §3.1): Countdown, with Join disabled until `joinable` or the countdown ends. */
export function ScheduledLobby({
  title,
  children,
  to,
  now,
  joinable,
  opensAt,
  onJoin,
  onAddToCalendar,
}: {
  title: unknown
  children?: unknown
  to: number
  now?: number | undefined
  joinable?: boolean
  opensAt?: string
  onJoin?: (() => void) | undefined
  onAddToCalendar?: (() => void) | undefined
}) {
  const ended = state(false)
  const can = derived(() => !!joinable || ended.value)
  const id = uid('sched')
  return (
    <Card eyebrow="Scheduled lobby" title={title} sweep={false} aria-labelledby={undefined}>
      {children !== undefined && <p>{children}</p>}
      <Countdown to={to} now={now} onDone={() => (ended.value = true)} />
      <p>
        <Button
          size="sm"
          disabled={!can.value}
          aria-describedby={!can.value && opensAt ? id : undefined}
          onClick={() => onJoin?.()}
        >
          Join
        </Button>
        {onAddToCalendar && (
          <Button emphasis="outline" tone="neutral" size="sm" onClick={onAddToCalendar}>
            <G name="cal" />
            Add to calendar
          </Button>
        )}
      </p>
      {opensAt && !can.value && <small id={id}>Opens at {opensAt}</small>}
    </Card>
  )
}
