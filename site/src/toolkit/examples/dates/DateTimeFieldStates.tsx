import { DateTimeField, Grid } from '@kerf/veneer'

import { Cell, REGIONS as _REGIONS } from '../../world'
import { TODAY } from './shared-event'

export const DateTimeFieldStates = () => (
  <Grid
    cols={2}
    gap="group"
  >
    <Cell name="Empty">
      <DateTimeField
        label="Starts"
        today={TODAY}
      />
    </Cell>
    <Cell name="Hint">
      <DateTimeField
        label="Starts"
        today={TODAY}
        hint="In your time zone."
      />
    </Cell>
    <Cell name="Invalid">
      <DateTimeField
        label="Starts"
        today={TODAY}
        defaultValue="2026-10-30T09:00"
        error="Pick a time in the future."
      />
    </Cell>
    <Cell name="Read-only">
      <DateTimeField
        label="Starts"
        today={TODAY}
        defaultValue="2026-11-07T22:00"
        readonly
      />
    </Cell>
    <Cell name="Disabled">
      <DateTimeField
        label="Starts"
        today={TODAY}
        defaultValue="2026-11-07T22:00"
        disabled
      />
    </Cell>
  </Grid>
)
