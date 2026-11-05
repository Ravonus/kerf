import { Grid, Input } from '@weft-js/warp'
import { Cell } from '../../world'

export const InputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty">
      <Input label="Project name" />
    </Cell>
    <Cell name="Filled">
      <Input label="Project name" defaultValue="storefront" />
    </Cell>
    <Cell name="Hint">
      <Input label="Project name" hint="Lowercase letters and dashes." />
    </Cell>
    <Cell name="Invalid">
      <Input
        label="Project name"
        defaultValue="Store Front"
        error="Use lowercase letters and dashes."
      />
    </Cell>
    <Cell name="Disabled">
      <Input label="Project name" defaultValue="storefront" disabled />
    </Cell>
    <Cell name="Read-only">
      <Input label="Project name" defaultValue="storefront" readonly />
    </Cell>
  </Grid>
)
