import { SyncIndicator } from '@weft-js/warp'

import { SYNC_STATES } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export const SyncIndicatorStates = () => (
  <>
    {SYNC_STATES.map((s) => (
      <SyncIndicator key={s} state={s} />
    ))}
  </>
)
