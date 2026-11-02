import { announce, connectionAnnouncement, liveState, type LiveState } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack, watch } from '@weft-js/core'
import { Banner, LiveStatus } from '../parts'
import { Button } from '../Button'
import { val } from './shared'

const TEXT: Record<LiveState, string> = { connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' }

type Status = string | undefined | { value: string } | (() => string | undefined)

/**
 * The one pill (07 §0, §4.4): `state` is `.live`, `stream().status` or `channel.status`, mapped to the four states. It
 * announces each change once; `queued` is the count in "Back online. 4 updates."
 */
export function ConnectionPill({ state: status, label = 'Connection', queued = 0 }: { state: Status; label?: string; queued?: number }) {
  const now = derived(() => liveState(val(status as any)))
  const words = derived(() => TEXT[now.value])
  let root: HTMLSpanElement | undefined
  onMount(() => watch(() => now.value, (next, prev) => {
    const say = connectionAnnouncement(prev, next, untrack(() => queued))
    if (say && root) announce(root.ownerDocument, say.text, say.assertive)
  }))
  return <span ref={(n: any) => (root = n)}><LiveStatus state={now.value} label={label}>{words.value}</LiveStatus></span>
}

/**
 * The trouble banner (07 §4.4): nothing while live or connecting, after `delay` ms of reconnecting (data stays, edits
 * queue), at once when offline, with Retry. Quiet for assistive tech: the pill does the announcing.
 */
export function ConnectionBanner({ state: status, delay = 3000, onRetry, offline = "You're offline. Showing what was saved; new notifications will arrive when you reconnect.", reconnecting = 'Reconnecting… changes you make are queued.' }: { state: Status; delay?: number; onRetry?: () => void; offline?: any; reconnecting?: any }) {
  const now = derived(() => liveState(val(status as any)))
  const late = state(false)
  const retry = untrack(() => onRetry)
  onMount(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    watch(() => now.value, next => {
      clearTimeout(t)
      if (next !== 'reconnecting') { late.value = false; return }
      t = setTimeout(() => (late.value = true), untrack(() => delay))
    })
    onCleanup(() => clearTimeout(t))
  })
  return (
    <>
      {now.value === 'offline' && <Banner tone="critical" actions={retry ? () => <Button emphasis="outline" tone="neutral" size="sm" onClick={retry}>Retry now</Button> : undefined}>{offline}</Banner>}
      {now.value === 'reconnecting' && late.value && <Banner tone="caution">{reconnecting}</Banner>}
    </>
  )
}
