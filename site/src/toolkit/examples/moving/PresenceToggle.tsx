import { state } from '@kerf/core'
import {
  Button,
  Presence,
  Stack,
  Text,
} from '@kerf/veneer'

export function PresenceToggle() {
  const open = state(true)
  return (
    <Stack>
      <Button onClick={() => (open.value = !open.value)}>
        {open.value ? 'Hide details' : 'Show details'}
      </Button>
      <Presence when={open.value}>
        <Text>Deploys roll out region by region.</Text>
        <Text>A failed health check rolls back.</Text>
      </Presence>
    </Stack>
  )
}
