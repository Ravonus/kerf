import { Stack, Switch } from '@kerf-js/veneer'

export const SwitchPlacement = () => (
  <Stack gap="related">
    <Switch checked>Preview deploys</Switch>
    <Switch
      checked
      placement="start"
    >
      Preview deploys
    </Switch>
  </Stack>
)
