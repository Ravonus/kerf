import { PresenceStack } from '@kerf/veneer'

import { PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const PresenceStackOverflow = () => (
  <PresenceStack
    peers={PEERS}
    max={3}
  />
)
