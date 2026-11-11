import { DurationField, Stack } from '@kerf/veneer'

import { MIN_SEC, DAY_HOUR } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DurationFieldUnits = () => (
  <Stack gap="group">
    <DurationField
      label="Health check every"
      units={[...MIN_SEC]}
      defaultValue="PT30S"
    />
    <DurationField
      label="Keep previews for"
      units={[...DAY_HOUR]}
      defaultValue="P7DT12H"
    />
  </Stack>
)
