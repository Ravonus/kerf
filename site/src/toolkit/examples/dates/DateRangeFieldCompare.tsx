import { state } from '@kerf-js/core'

import {
  DateRangeField,
  Stack,
  Text,
  compareRange,
} from '@kerf-js/veneer'

import type { DateRange } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function DateRangeFieldCompare() {
  const range = state<DateRange>({
    start: '2026-10-01',
    end: '2026-10-31',
  })
  const before = () =>
    compareRange(range.value, 'previous-period')
  return (
    <Stack gap="related">
      <DateRangeField
        label="Period"
        today={TODAY}
        value={range}
        compare="previous-period"
      />
      <Text
        subtle
        role="caption"
      >
        Compared with {before()?.start} to {before()?.end}
      </Text>
    </Stack>
  )
}
