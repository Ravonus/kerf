import { Grid, Switch } from '@weft-js/warp'
import { Cell } from '../../world'

export const SwitchStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Off">
      <Switch>Preview deploys</Switch>
    </Cell>
    <Cell name="On">
      <Switch checked>Preview deploys</Switch>
    </Cell>
    <Cell name="Hint">
      <Switch hint="Every pull request gets its own address.">Preview deploys</Switch>
    </Cell>
    <Cell name="Disabled off">
      <Switch disabled>Preview deploys</Switch>
    </Cell>
    <Cell name="Disabled on">
      <Switch checked disabled>
        Preview deploys
      </Switch>
    </Cell>
  </Grid>
)
