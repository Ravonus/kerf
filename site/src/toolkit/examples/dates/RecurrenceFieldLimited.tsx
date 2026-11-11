import { RecurrenceField } from '@kerf/veneer'

import { DAILY_WEEKLY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const RecurrenceFieldLimited = () => (
  <RecurrenceField
    label="Digest email"
    dtstart="2026-11-02"
    defaultValue="FREQ=DAILY"
    frequencies={[...DAILY_WEEKLY]}
    preview={3}
    locale="en-US"
  />
)
