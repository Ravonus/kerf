import { PeerSelection, Text } from '@weft-js/warp'

import { JUN } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const PeerSelectionText = () => (
  <Text>
    The stale window is <PeerSelection peer={JUN}>30 seconds</PeerSelection> on every region.
  </Text>
)
