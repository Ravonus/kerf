import { ConnectionPill } from '@kerf-js/veneer'

export const ConnectionPillStates = () => (
  <>
    <ConnectionPill state="live" />
    <ConnectionPill state="connecting" />
    <ConnectionPill state="reconnecting" />
    <ConnectionPill state="offline" />
  </>
)
