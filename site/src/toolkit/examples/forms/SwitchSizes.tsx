import { Stack, Switch } from '@weft-js/warp'

export const SwitchSizes = () => (
  <Stack gap="related">
    <Switch size="sm" checked>
      Preview deploys
    </Switch>
    <Switch checked>Preview deploys</Switch>
  </Stack>
)
