import { Badge, Row, Stack, Text } from '@weft-js/warp'
import { THREE_KEYS } from './shared'

export const ApiKeysTile = () => (
  <Stack
    gap="related"
    style="inline-size:300px"
  >
    {THREE_KEYS.map((k) => (
      <Row
        key={k.id}
        justify="between"
      >
        <Text>{k.name}</Text>
        <Badge>{k.scopes[0]}</Badge>
      </Row>
    ))}
  </Stack>
)
