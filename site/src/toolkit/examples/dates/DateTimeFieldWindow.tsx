import { state } from '@kerf-js/core'

import {
  DateTimeField,
  Stack,
  Text,
} from '@kerf-js/veneer'

import type { IsoDateTime } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- DateTimeField

export function DateTimeFieldWindow() {
  const at = state<IsoDateTime | null>('2026-11-07T22:00')
  return (
    <Stack gap="related">
      <DateTimeField
        label="Maintenance starts"
        today={TODAY}
        value={at}
        min="2026-11-02"
      />
      <Text
        subtle
        role="caption"
      >
        {at.value
          ? `Sent to the API as ${at.value}`
          : 'Pick a date and a time'}
      </Text>
    </Stack>
  )
}
