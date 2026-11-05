import { state } from '@weft-js/core'

import {
  InlineCalendar,
  Stack,
  Text,
} from '@weft-js/warp'

import type { DateRange } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function InlineCalendarRange() {
  const away = state<DateRange>({
    start: '2026-11-23',
    end: '2026-12-04',
  })
  return (
    <Stack gap="related">
      <InlineCalendar
        aria-label="Time away"
        selection="range"
        months={2}
        today={TODAY}
        value={away}
      />
      <Text
        subtle
        role="caption"
      >
        Away from {away.value.start ?? '…'} to{' '}
        {away.value.end ?? '…'}
      </Text>
    </Stack>
  )
}
