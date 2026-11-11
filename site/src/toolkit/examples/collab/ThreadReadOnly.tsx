import { Thread } from '@kerf/veneer'

import { EARLY_CHAT } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export const ThreadReadOnly = () => (
  <Thread
    label="Deploy d-4819 discussion"
    height="240px"
    messages={EARLY_CHAT}
  />
)
