import { ConnectionPill } from '@weft-js/warp'

export const ConnectionPillStates = () => (
  <>
    <ConnectionPill state="live" />
    <ConnectionPill state="connecting" />
    <ConnectionPill state="reconnecting" />
    <ConnectionPill state="offline" />
  </>
)
