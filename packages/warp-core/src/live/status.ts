// -- connection status (07 §4.4) ---------------------------------------------------------------------------------------

/** The four states every live surface reads as. */
export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'

/** `.live`, `stream().status` and `channel.status`, mapped to the four states (07 §4.5, §4.7). */
export function liveState(status: string | undefined | null): LiveState {
  switch (status!) {
    case 'live':
    case 'open':
    case 'streaming':
    case 'done':
      return 'live'
    case 'reconnecting':
      return 'reconnecting'
    case 'offline':
    case 'closed':
    case 'unauthorized':
    case 'error':
      return 'offline'
    default:
      return 'connecting'
  }
}

/** The worst of several states: offline, reconnecting, connecting, live. */
export const worstLive = (states: readonly LiveState[]): LiveState =>
  (['offline', 'reconnecting', 'connecting', 'live'] as const).find((s) => states.includes(s)) ??
  'connecting'

/** What a move between states says, if anything (07 §4.4): `queued` is the one summary on the way back. */
export function connectionAnnouncement(
  prev: LiveState | undefined,
  next: LiveState,
  queued = 0,
): { text: string; assertive?: boolean } | null {
  if (prev === next) return null
  if (next === 'offline') return { text: "You're offline. Showing saved data.", assertive: true }
  if (next === 'reconnecting' && prev === 'live') return { text: 'Connection lost. Reconnecting.' }
  if (next === 'live' && (prev === 'offline' || prev === 'reconnecting'))
    return {
      text: `Back online.${queued ? ` ${queued} ${queued === 1 ? 'update' : 'updates'}.` : ''}`,
    }
  return null
}
