import { PresenceStack } from '@weft-js/warp'

import { PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const PresenceStackOverflow = () => (
  <PresenceStack
    peers={PEERS}
    max={3}
  />
)
