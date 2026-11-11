import { state } from '@kerf-js/core'
import {
  Button,
  Row,
  SeatsMeter,
  Stack,
  Text,
} from '@kerf-js/veneer'

export function SeatsMeterInvite() {
  const used = state(10)
  const addSeat = () => {
    if (used.value < 12) used.value++
  }
  return (
    <Stack gap="related">
      <SeatsMeter
        used={used.value}
        total={12}
      />
      <Row justify="between">
        <Text subtle>Pending invites use a seat.</Text>
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          aria-disabled={
            used.value >= 12 ? 'true' : undefined
          }
          onClick={addSeat}
        >
          Add a seat
        </Button>
      </Row>
    </Stack>
  )
}
