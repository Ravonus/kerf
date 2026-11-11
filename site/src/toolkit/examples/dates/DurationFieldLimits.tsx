import { DurationField } from '@kerf/veneer'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DurationFieldLimits = () => (
  <DurationField
    label="Canary period"
    hint="At most 2 hours, in 15-minute steps"
    defaultValue="PT45M"
    max="PT2H"
    step={{ m: 15 }}
  />
)
