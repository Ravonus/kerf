import { Grid, Select } from '@kerf-js/veneer'
import { Cell } from '../../world'
import { REGION_OPTIONS } from './shared'

export const SelectStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <Select
        label="Region"
        placeholder="Choose a region"
        options={REGION_OPTIONS}
      />
    </Cell>
    <Cell name="Filled">
      <Select
        label="Region"
        options={REGION_OPTIONS}
        defaultValue="us-east"
      />
    </Cell>
    <Cell name="Hint">
      <Select
        label="Region"
        options={REGION_OPTIONS}
        hint="Moving a project redeploys it."
      />
    </Cell>
    <Cell name="Invalid">
      <Select
        label="Region"
        placeholder="Choose a region"
        options={REGION_OPTIONS}
        error="Choose where this project runs."
      />
    </Cell>
    <Cell name="Disabled">
      <Select
        label="Region"
        options={REGION_OPTIONS}
        defaultValue="us-east"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <Select
        label="Region"
        options={REGION_OPTIONS}
        defaultValue="us-east"
        readonly
      />
    </Cell>
  </Grid>
)
