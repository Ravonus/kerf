import { MonthPicker, Stack } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const MonthPickerSizes = () => (
  <Stack gap="group">
    <MonthPicker
      label="Small"
      size="sm"
      today={TODAY}
      defaultValue="2026-10"
    />
    <MonthPicker
      label="Medium"
      today={TODAY}
      defaultValue="2026-10"
    />
    <MonthPicker
      label="Large"
      size="lg"
      today={TODAY}
      defaultValue="2026-10"
    />
  </Stack>
)
