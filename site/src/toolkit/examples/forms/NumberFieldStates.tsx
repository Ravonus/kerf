import { Grid, NumberField } from '@kerf/veneer'
import { Cell } from '../../world'

export const NumberFieldStates = () => (
  <Grid
    cols={2}
    gap="group"
  >
    <Cell name="Empty">
      <NumberField
        label="Retries"
        min={0}
        max={10}
      />
    </Cell>
    <Cell name="Hint">
      <NumberField
        label="Retries"
        defaultValue={3}
        min={0}
        max={10}
        hint="0 turns retries off."
      />
    </Cell>
    <Cell name="Invalid">
      <NumberField
        label="Retries"
        defaultValue={10}
        min={0}
        max={10}
        error="Ten retries can hide a real failure."
      />
    </Cell>
    <Cell name="Read-only">
      <NumberField
        label="Retries"
        defaultValue={3}
        readonly
      />
    </Cell>
    <Cell name="Disabled">
      <NumberField
        label="Retries"
        defaultValue={3}
        disabled
      />
    </Cell>
  </Grid>
)
