import { MonthPicker, Grid } from '@weft-js/warp'

import { TODAY, Cell } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const MonthPickerStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty">
      <MonthPicker label="Month" today={TODAY} />
    </Cell>
    <Cell name="Hint">
      <MonthPicker label="Month" today={TODAY} hint="Invoices go out on the 1st." />
    </Cell>
    <Cell name="Invalid">
      <MonthPicker label="Month" today={TODAY} error="Choose a month to export." />
    </Cell>
    <Cell name="Read-only">
      <MonthPicker label="Month" today={TODAY} defaultValue="2026-10" readonly />
    </Cell>
    <Cell name="Disabled">
      <MonthPicker label="Month" today={TODAY} defaultValue="2026-10" disabled />
    </Cell>
  </Grid>
)
