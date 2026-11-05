import { DateField, Stack } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateFieldStates = () => (
  <Stack gap="group">
    <DateField
      label="Release date"
      today={TODAY}
      hint="Optional"
    />
    <DateField
      label="Release date"
      today={TODAY}
      error="Pick a date after the freeze ends"
      defaultValue="2026-12-24"
    />
    <DateField
      label="Release date"
      today={TODAY}
      defaultValue="2026-11-14"
      readonly
    />
    <DateField
      label="Release date"
      today={TODAY}
      defaultValue="2026-11-14"
      disabled
    />
  </Stack>
)
