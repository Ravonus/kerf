import {
  Badge,
  Row,
  SeatsMeter,
  Stack,
  Text,
} from '@weft-js/warp'
import { FIRST_FOUR } from './shared'

export const MembersTableTile = () => (
  <Stack
    gap="related"
    style="inline-size:300px"
  >
    <SeatsMeter
      used={10}
      total={12}
    />
    {FIRST_FOUR.map((m) => (
      <Row
        key={m.id}
        justify="between"
      >
        <Text>{m.name}</Text>
        <Badge>{m.role}</Badge>
      </Row>
    ))}
  </Stack>
)
