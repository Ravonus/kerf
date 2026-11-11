import { Grid, Switch } from '@kerf/veneer'
import { Cell } from '../../world'

const previewHint =
  'Every pull request gets its own address.'

export const SwitchStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Off">
      <Switch>Preview deploys</Switch>
    </Cell>
    <Cell name="On">
      <Switch checked>Preview deploys</Switch>
    </Cell>
    <Cell name="Hint">
      <Switch hint={previewHint}>Preview deploys</Switch>
    </Cell>
    <Cell name="Disabled off">
      <Switch disabled>Preview deploys</Switch>
    </Cell>
    <Cell name="Disabled on">
      <Switch
        checked
        disabled
      >
        Preview deploys
      </Switch>
    </Cell>
  </Grid>
)
