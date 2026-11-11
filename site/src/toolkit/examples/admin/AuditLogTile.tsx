import { Stack, Text } from '@kerf/veneer'
import { LATEST_EVENTS } from './shared'

export const AuditLogTile = () => (
  <Stack
    gap="related"
    style="inline-size:320px"
  >
    {LATEST_EVENTS.map((e) => (
      <Text key={e.id}>
        {e.actor} {e.verb} {e.target}
      </Text>
    ))}
  </Stack>
)
