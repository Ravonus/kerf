import { state } from '@weft-js/core'

import { PeriodPicker, Stack, Text } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function PeriodPickerReport() {
  const period = state<string | null>('2026-Q4')
  return (
    <Stack gap="related">
      <PeriodPicker
        label="Report period"
        today={TODAY}
        value={period}
      />
      <Text
        subtle
        role="caption"
      >
        Saved as {period.value ?? 'nothing'}
      </Text>
    </Stack>
  )
}
