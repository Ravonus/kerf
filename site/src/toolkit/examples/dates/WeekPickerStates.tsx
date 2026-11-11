import { WeekPicker, Grid } from '@kerf-js/veneer'

import { Cell, REGIONS as _REGIONS } from '../../world'
import { TODAY } from './shared-event'

export const WeekPickerStates = () => (
  <Grid
    cols={2}
    gap="group"
  >
    <Cell name="Empty">
      <WeekPicker
        label="Week"
        today={TODAY}
      />
    </Cell>
    <Cell name="Hint">
      <WeekPicker
        label="Week"
        today={TODAY}
        hint="Monday to Sunday."
      />
    </Cell>
    <Cell name="Invalid">
      <WeekPicker
        label="Week"
        today={TODAY}
        error="Choose the week you worked."
      />
    </Cell>
    <Cell name="Read-only">
      <WeekPicker
        label="Week"
        today={TODAY}
        defaultValue="2026-W44"
        readonly
      />
    </Cell>
    <Cell name="Disabled">
      <WeekPicker
        label="Week"
        today={TODAY}
        defaultValue="2026-W44"
        disabled
      />
    </Cell>
  </Grid>
)
