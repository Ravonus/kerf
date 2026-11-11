import { state } from '@kerf-js/core'

import { Stack, Text, WeekPicker } from '@kerf-js/veneer'

import type { IsoWeek } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function WeekPickerSprint() {
  const week = state<IsoWeek | null>('2026-W45')
  return (
    <Stack gap="related">
      <WeekPicker
        label="Sprint week"
        today={TODAY}
        value={week}
      />
      <Text
        subtle
        role="caption"
      >
        Saved as {week.value ?? 'nothing'}
      </Text>
    </Stack>
  )
}
