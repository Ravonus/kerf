import { Checkbox, Grid } from '@kerf-js/veneer'
import { Cell } from '../../world'

export const CheckboxStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Off">
      <Checkbox>Deploy on push</Checkbox>
    </Cell>
    <Cell name="On">
      <Checkbox checked>Deploy on push</Checkbox>
    </Cell>
    <Cell name="Part of a set">
      <Checkbox indeterminate>Deploy on push</Checkbox>
    </Cell>
    <Cell name="Hint">
      <Checkbox hint="Every push to main goes live.">
        Deploy on push
      </Checkbox>
    </Cell>
    <Cell name="Invalid">
      <Checkbox error="Accept this to carry on.">
        Deploy on push
      </Checkbox>
    </Cell>
    <Cell name="Disabled">
      <Checkbox
        checked
        disabled
      >
        Deploy on push
      </Checkbox>
    </Cell>
  </Grid>
)
