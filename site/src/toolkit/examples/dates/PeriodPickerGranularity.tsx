import { PeriodPicker, Stack } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const PeriodPickerGranularity = () => (
  <Stack gap="group">
    <PeriodPicker label="Year" today={TODAY} defaultValue="2026" granularity="year" />
    <PeriodPicker label="Quarter" today={TODAY} defaultValue="2026-Q4" granularity="quarter" />
    <PeriodPicker label="Month" today={TODAY} defaultValue="2026-10" granularity="month" />
    <PeriodPicker label="Week" today={TODAY} defaultValue="2026-W45" granularity="week" />
  </Stack>
)
