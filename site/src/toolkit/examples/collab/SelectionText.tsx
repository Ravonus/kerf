import { PeerSelection, Text } from '@kerf-js/veneer'

import { JUN } from '../../world'

import { wait as _Shared0 } from './shared-wait'

const time = '30 seconds'

export const PeerSelectionText = () => (
  <Text>
    The stale window is{' '}
    <PeerSelection peer={JUN}>{time}</PeerSelection> on
    every region.
  </Text>
)
