import { state } from '@weft-js/core'

import {
  RecurrenceField,
  Stack,
  Tag,
} from '@weft-js/warp'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- RecurrenceField

export function RecurrenceFieldBackup() {
  const rule = state<string | null>(
    'FREQ=WEEKLY;BYDAY=MO,TH',
  )
  return (
    <Stack gap="related">
      <RecurrenceField
        label="Backups run"
        dtstart="2026-11-02"
        value={rule}
        locale="en-US"
      />
      <Tag>{rule.value}</Tag>
    </Stack>
  )
}
