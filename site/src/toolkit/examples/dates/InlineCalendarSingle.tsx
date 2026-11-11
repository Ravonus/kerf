import { state } from '@kerf/core'

import { InlineCalendar, Stack, Text } from '@kerf/veneer'

import type { IsoDate } from '@kerf/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- InlineCalendar

export function InlineCalendarSingle() {
  const day = state<IsoDate | null>('2026-11-12')
  return (
    <Stack gap="related">
      <InlineCalendar
        aria-label="Release day"
        today={TODAY}
        value={day}
      />
      <Text
        subtle
        role="caption"
      >
        Release day: {day.value ?? 'not set'}
      </Text>
    </Stack>
  )
}
