import { state } from '@weft-js/core'

import { MonthPicker, Stack, Text } from '@weft-js/warp'

import type { IsoMonth } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- Month, week and period

export function MonthPickerInvoice() {
  const month = state<IsoMonth | null>('2026-10')
  return (
    <Stack gap="related">
      <MonthPicker
        label="Invoice month"
        today={TODAY}
        value={month}
        max="2026-11"
      />
      <Text
        subtle
        role="caption"
      >
        Showing {month.value ?? 'every month'}
      </Text>
    </Stack>
  )
}
