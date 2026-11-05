import { Select, Stack } from '@weft-js/warp'
import { REGION_OPTIONS } from './shared'

export const SelectSizes = () => (
  <Stack gap="group">
    <Select label="Region" size="sm" options={REGION_OPTIONS} />
    <Select label="Region" options={REGION_OPTIONS} />
    <Select label="Region" size="lg" options={REGION_OPTIONS} />
  </Stack>
)
