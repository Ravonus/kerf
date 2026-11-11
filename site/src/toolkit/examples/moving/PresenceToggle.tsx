import { state } from '@kerf-js/core'
import {
  Button,
  Presence,
  Stack,
  Text,
} from '@kerf-js/veneer'

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
