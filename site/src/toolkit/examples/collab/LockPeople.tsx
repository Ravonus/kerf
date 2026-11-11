import { LockIndicator } from '@kerf/veneer'

import { JUN, LENA } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export const LockIndicatorPeople = () => (
  <>
    <LockIndicator peer={JUN} />
    <LockIndicator peer={LENA} />
  </>
)
