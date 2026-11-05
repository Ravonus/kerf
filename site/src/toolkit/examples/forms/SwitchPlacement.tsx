import { Stack, Switch } from '@weft-js/warp'

export const SwitchPlacement = () => (
  <Stack gap="related">
    <Switch checked>Preview deploys</Switch>
    <Switch checked placement="start">
      Preview deploys
    </Switch>
  </Stack>
)
