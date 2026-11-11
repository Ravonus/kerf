import { RecurrenceField } from '@kerf-js/veneer'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

const schedule =
  'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;BYHOUR=9'

export const RecurrenceFieldCustom = () => (
  <RecurrenceField
    label="Report"
    dtstart="2026-11-02"
    defaultValue={schedule}
    locale="en-US"
  />
)
