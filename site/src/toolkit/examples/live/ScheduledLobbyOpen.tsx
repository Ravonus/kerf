import { state } from '@weft-js/core'
import {
  ScheduledLobby,
  Stack,
  Text,
} from '@weft-js/warp'

export function ScheduledLobbyOpen() {
  const to = Date.now() + 2 * 60_000
  const joined = state(false)
  return (
    <Stack gap="related">
      <ScheduledLobby
        title="Incident review"
        to={to}
        joinable
        onJoin={() => (joined.value = true)}
      />
      {joined.value && (
        <Text subtle>Joining the call.</Text>
      )}
    </Stack>
  )
}
