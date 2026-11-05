import { RecurrenceField } from '@weft-js/warp'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const RecurrenceFieldCustom = () => (
  <RecurrenceField
    label="Report"
    dtstart="2026-11-02"
    defaultValue="FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;BYHOUR=9"
    locale="en-US"
  />
)
