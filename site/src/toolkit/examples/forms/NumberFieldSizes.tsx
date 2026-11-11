// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { NumberField, Stack } from '@kerf/veneer'

export const NumberFieldSizes = () => (
  <Stack gap="group">
    <NumberField
      label="Small"
      size="sm"
      defaultValue={3}
      min={0}
      max={10}
    />
    <NumberField
      label="Medium"
      defaultValue={3}
      min={0}
      max={10}
    />
    <NumberField
      label="Large"
      size="lg"
      defaultValue={3}
      min={0}
      max={10}
    />
  </Stack>
)
