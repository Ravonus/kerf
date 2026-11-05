import { LockedField, Stack } from '@weft-js/warp'

import { JUN } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const LockedFieldOwner = () => (
  <Stack gap="group">
    <LockedField peer={JUN} label="Runbook owner" value="Jun Tanaka" />
    <LockedField peer={null} label="Review date" value="Nov 14" />
  </Stack>
)
