import { SeatsMeter, Stack } from '@kerf/veneer'

export const SeatsMeterLevels = () => (
  <Stack gap="group">
    <SeatsMeter
      used={4}
      total={12}
    />
    <SeatsMeter
      used={10}
      total={12}
    />
    <SeatsMeter
      used={12}
      total={12}
    />
  </Stack>
)
