import { Stack, Switch } from '@kerf-js/veneer'

export const SwitchSizes = () => (
  <Stack gap="related">
    <Switch
      size="sm"
      checked
    >
      Preview deploys
    </Switch>
    <Switch checked>Preview deploys</Switch>
  </Stack>
)
