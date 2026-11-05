import { PeriodPicker, Grid } from '@weft-js/warp'

import { TODAY, Cell } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const PeriodPickerStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty">
      <PeriodPicker label="Period" today={TODAY} granularity="quarter" />
    </Cell>
    <Cell name="Hint">
      <PeriodPicker
        label="Period"
        today={TODAY}
        granularity="quarter"
        hint="Closed quarters only."
      />
    </Cell>
    <Cell name="Invalid">
      <PeriodPicker
        label="Period"
        today={TODAY}
        defaultValue="2027-Q1"
        error="That quarter hasn't started."
      />
    </Cell>
    <Cell name="Read-only">
      <PeriodPicker label="Period" today={TODAY} defaultValue="2026-Q3" readonly />
    </Cell>
    <Cell name="Disabled">
      <PeriodPicker label="Period" today={TODAY} defaultValue="2026-Q3" disabled />
    </Cell>
  </Grid>
)
