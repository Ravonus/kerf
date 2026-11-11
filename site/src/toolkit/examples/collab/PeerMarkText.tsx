import { PeerMark, Text } from '@kerf/veneer'

import { LENA } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const PeerMarkText = () => (
  <Text>
    Roll back first, then{' '}
    <PeerMark peer={LENA}>read the logs</PeerMark>. The
    person on call owns the decision.
  </Text>
)
