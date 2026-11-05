import { state } from '@weft-js/core'

import {
  Card,
  RecurrenceField,
  Stack,
  Text,
} from '@weft-js/warp'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function RecurrenceFieldInCard() {
  const rule = state<string | null>(
    'FREQ=MONTHLY;BYMONTHDAY=1',
  )
  return (
    <Card title="Rotate certificates">
      <Stack gap="group">
        <Text subtle>
          edge-cache renews its certificates on this
          schedule.
        </Text>
        <RecurrenceField
          label="Repeats"
          dtstart="2026-12-01"
          value={rule}
          preview={3}
          locale="en-US"
        />
      </Stack>
    </Card>
  )
}
