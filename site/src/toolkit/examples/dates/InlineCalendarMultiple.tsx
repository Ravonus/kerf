import { state } from '@kerf-js/core'

import {
  InlineCalendar,
  Stack,
  Text,
} from '@kerf-js/veneer'

import type { IsoDate } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function InlineCalendarMultiple() {
  const days = state<IsoDate[]>([
    '2026-11-03',
    '2026-11-05',
    '2026-11-10',
  ])
  return (
    <Stack gap="related">
      <InlineCalendar
        aria-label="Office days"
        selection="multiple"
        today={TODAY}
        value={days}
      />
      <Text
        subtle
        role="caption"
      >
        {days.value.length} office days
      </Text>
    </Stack>
  )
}
