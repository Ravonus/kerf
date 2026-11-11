import { ClockIcon, RefreshIcon, SparkleIcon, WifiIcon, WifiOffIcon } from '@kerf/veneer-icons'
import { announce, connView } from '@kerf/veneer-core'
import { derived, onCleanup, onMount, state, untrack, watch, type State } from '@kerf/core'
import { Button, type ButtonProps } from '../Button'
import { useCooldown } from './kit'
import '../styles'
import '@kerf/veneer-core/styles/flows/tokens.css'
import '@kerf/veneer-core/styles/flows/base.css'
import '@kerf/veneer-core/styles/flows/conn.css'
import '@kerf/veneer-core/styles/components/spinner.css'

type Live<T> = T | { readonly value: T } | (() => { readonly value: T } | T)

const read = <T,>(v: Live<T>): T => {
  const x = typeof v === 'function' ? (v as () => { readonly value: T } | T)() : v
  return x !== null && typeof x === 'object' && 'value' in x ? x.value : x
}
/** `online` from @kerf/core/browser, its result, or a boolean: a factory is called once. */
function liveOf<T>(get: () => Live<T>) {
  const src = untrack(get)
  const once = typeof src === 'function' ? untrack(() => (src as () => Live<T>)()) : undefined
  return derived(() => (once !== undefined ? read<T>(once) : read<T>(get())))
}

const RECOVERED_S = 3
const LATER_MS = 30 * 60 * 1000

/** Props for ConnBanner. */
export interface ConnBannerProps {
  /** `online` from `@kerf/core/browser`, its derived, or a boolean. */
  online?: Live<boolean>
  /** The `.live` state (07 §4.4): `live`, `connecting`, `reconnecting`, `offline`. */
  state?: Live<string | undefined>
  /** Schema hash mismatch (§5.4). */
  stale?: Live<boolean | undefined>
  /** A mutation failed because the contract changed: the Banner turns caution. */
  contractFailed?: boolean
  /** Seconds to the next try: Kerf's backoff. */
  retryIn?: number
  /** Adds Retry now, to try before the backoff runs out. */
  onRetry?: () => void
  /** Saved changes waiting to sync. */
  changes?: number
  /** Save drafts, then reload. */
  onReload?: () => void
  /** Later hides the stale banner for 30 minutes. */
  onLater?: () => void
  /** "A new version of {name} is ready". */
  name?: string | undefined
}

const plural = (n: number) => (n === 1 ? '1 change' : `${n} changes`)

/**
 * The connection and deploy banner under the shell header (09 §5.3, §5.4): offline with its retry countdown,
 * reconnecting, "Back online" for 3s, a stale deploy with Reload and Later. Takes its state as props. Offline says so
 * assertively once and back online politely once; the countdown itself is never announced. Needs a mounted <Toaster />.
 */
export function ConnBanner({
  online = true,
  state: conn,
  stale,
  contractFailed,
  retryIn,
  onRetry,
  changes = 0,
  onReload,
  onLater,
  name = 'the app',
}: ConnBannerProps) {
  const isOn = liveOf<boolean>(() => online)
  const st = liveOf<string | undefined>(() => conn)
  const old = liveOf<boolean | undefined>(() => stale)
  const later = state(false)
  const recovered = state(false)
  const view = derived(() =>
    connView({
      online: isOn.value,
      state: st.value,
      stale: old.value && !later.value,
      recovered: recovered.value,
    }),
  )
  const backIn = useCooldown(
    () => (recovered.value ? RECOVERED_S : undefined),
    () => (recovered.value = false),
  )
  const retry = useCooldown(() => retryIn)
  const postpone = connectionEffects({
    view,
    recovered,
    later,
    name: () => name,
    onLater: () => onLater?.(),
  })
  return (
    <>
      {view.value && (
        <div
          data-scope="conn"
          data-state={view.value === 'stale' && contractFailed ? 'limited' : view.value}
        >
          {view.value === 'offline' && (
            <ConnOffline retryIn={retryIn} retry={retry} onRetry={onRetry} />
          )}
          {view.value === 'reconnecting' && (
            <>
              <span data-scope="spinner" aria-hidden="true"></span>
              <span data-part="msg">
                <b>Reconnecting…</b>{' '}
                {changes > 0
                  ? `Sending ${plural(changes)}.`
                  : retryIn !== undefined
                    ? `Trying again in ${retry.value}s.`
                    : ''}
              </span>
            </>
          )}
          {view.value === 'online' && <ConnOnline changes={changes} backIn={backIn} />}
          {view.value === 'stale' && (
            <ConnStale
              name={name}
              contractFailed={contractFailed}
              postpone={postpone}
              onReload={onReload}
            />
          )}
        </div>
      )}
    </>
  )
}

function connectionEffects({
  view,
  recovered,
  later,
  name,
  onLater,
}: {
  view: { readonly value: ReturnType<typeof connView> }
  recovered: State<boolean>
  later: State<boolean>
  name: () => string
  onLater: () => void
}) {
  let hide: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(hide))
  onMount(() => {
    watch(
      () => view.value,
      (v, was) => {
        if (v === 'offline')
          announce(document, "You're offline. Changes are saved on this device.", true)
        if (v === 'stale') announce(document, `A new version of ${untrack(name)} is ready.`)
        if (was === 'offline' || was === 'reconnecting') {
          if (v === undefined || v === 'stale') {
            recovered.value = true
            announce(document, 'Back online.')
          }
        }
      },
    )
  })
  return () => {
    later.value = true
    hide = setTimeout(() => (later.value = false), LATER_MS)
    onLater()
  }
}

/** Props for RateLimited. */
export interface RateLimitedProps {
  /** Seconds, from the typed `RATE_LIMITED.retryAfter`: never a guess. */
  retryAfter: number
  title?: unknown
  /** "You can run 5 exports a minute." */
  description?: unknown
  /** The action that hit the limit: disabled, labelled "Try again in 20s", and back by itself. */
  trigger?: ButtonProps
  /** Called when the wait is over and the action is back. */
  onDone?: () => void
}

/** Rate limited (09 §5.5): a caution notice in place with a draining rail. Polite at start and end only; the numbers keep counting under reduced motion. */
export function RateLimited({
  retryAfter,
  title = 'Limit reached.',
  description,
  trigger,
  onDone,
}: RateLimitedProps) {
  const total = derived(() => retryAfter)
  const left = useCooldown(
    () => total.value,
    () => {
      announce(document, 'You can try again now.')
      onDone?.()
    },
  )
  const hasTrigger = derived(() => !!trigger)
  const on = derived(() => left.value > 0)
  onMount(() =>
    announce(
      document,
      `${untrack(() => (typeof title === 'string' ? title : 'Limit reached.'))} Try again in ${untrack(() => total.value)}s.`,
    ),
  )
  return (
    <div data-scope="stack" style="--_gap:8px">
      {on.value && (
        <div data-scope="conn" data-state="limited">
          <ClockIcon />
          <span data-part="msg">
            <b>{title}</b> {description} Try again in {left.value}s.
          </span>
          <span data-part="rail" data-on="" aria-hidden="true">
            <span data-part="rail-fill" style={`--p:${left.value / total.value}`}></span>
          </span>
        </div>
      )}
      {hasTrigger.value && (
        <div>
          <Button {...trigger} disabled={on.value}>
            {on.value ? `Try again in ${left.value}s` : trigger!.children}
          </Button>
        </div>
      )}
    </div>
  )
}

function ConnOnline({
  changes,
  backIn,
}: {
  changes: number
  backIn: ReturnType<typeof useCooldown>
}) {
  return (
    <>
      <WifiIcon />
      <span data-part="msg">
        <b>Back online.</b> {changes > 0 ? `${plural(changes)} synced.` : ''}
      </span>
      <span data-part="rail" data-on="" aria-hidden="true">
        <span data-part="rail-fill" style={`--p:${backIn.value / RECOVERED_S}`}></span>
      </span>
    </>
  )
}
function ConnStale({
  name,
  contractFailed,
  postpone,
  onReload,
}: {
  name: string
  contractFailed: ConnBannerProps['contractFailed']
  postpone: () => void
  onReload: ConnBannerProps['onReload']
}) {
  return (
    <>
      <SparkleIcon />
      <span data-part="msg">
        <b>A new version of {name} is ready.</b>{' '}
        {contractFailed ? 'Reload to finish saving.' : 'Reload to update; your draft is kept.'}
      </span>
      <Button emphasis="ghost" size="sm" tone="neutral" onClick={postpone}>
        Later
      </Button>
      <Button size="sm" tone="info" onClick={onReload}>
        <RefreshIcon />
        Reload
      </Button>
    </>
  )
}

function ConnOffline({
  retryIn,
  retry,
  onRetry,
}: {
  retryIn: ConnBannerProps['retryIn']
  retry: ReturnType<typeof useCooldown>
  onRetry: ConnBannerProps['onRetry']
}) {
  return (
    <>
      <WifiOffIcon />
      <span data-part="msg">
        <b>You're offline.</b> Changes are saved on this device and sync when you reconnect.
      </span>
      {retryIn !== undefined && <span>Retrying in {retry.value}s</span>}
      {onRetry && (
        <Button emphasis="ghost" size="sm" tone="neutral" onClick={onRetry}>
          Retry now
        </Button>
      )}
    </>
  )
}
