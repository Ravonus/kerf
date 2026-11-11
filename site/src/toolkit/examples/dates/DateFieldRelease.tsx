import { state } from '@kerf-js/core'

import { DateField, Stack, Text } from '@kerf-js/veneer'

import type { IsoDate } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function DateFieldRelease() {
  const date = state<IsoDate | null>('2026-11-14')
  return (
    <Stack gap="related">
      <DateField
        label="Release date"
        today={TODAY}
        value={date}
      />
      <Text
        subtle
        role="caption"
      >
        {date.value
          ? `Saved as ${date.value}`
          : 'No date set'}
      </Text>
    </Stack>
  )
}
