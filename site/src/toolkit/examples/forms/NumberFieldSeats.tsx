// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { state } from '@weft-js/core'
import { NumberField, Stack, Text } from '@weft-js/warp'

export function NumberFieldSeats() {
  const seats = state<number | null>(8)
  return (
    <Stack gap="related">
      <NumberField label="Seats" value={seats} min={1} max={50} hint="$12 a seat, each month." />
      <Text subtle>Total: ${(seats.value ?? 0) * 12} a month</Text>
    </Stack>
  )
}
