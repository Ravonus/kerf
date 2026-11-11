import { state } from '@kerf-js/core'
import {
  Button,
  Presence,
  Stack,
  Text,
} from '@kerf-js/veneer'

export function PresenceRise() {
  const saved = state(false)
  return (
    <Stack>
      <Button
        onClick={() => (saved.value = !saved.value)}
      >
        {saved.value ? 'Undo' : 'Save'}
      </Button>
      <Presence
        when={saved.value}
        motion="rise"
      >
        <Text>Saved a moment ago.</Text>
      </Presence>
    </Stack>
  )
}
