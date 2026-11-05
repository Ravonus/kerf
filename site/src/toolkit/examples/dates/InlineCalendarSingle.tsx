import { state } from '@weft-js/core'

import {
  InlineCalendar,
  Stack,
  Text,
} from '@weft-js/warp'

import type { IsoDate } from '@weft-js/warp'

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
