import { ViewportRail } from '@kerf-js/veneer'

import { VIEWPORT_PEERS } from '../../world'

import { RailHeight } from './shared-wait'

export const ViewportRailDocument = () => (
  <RailHeight>
    <ViewportRail
      peers={VIEWPORT_PEERS}
      self={{ top: 0.02, height: 0.3 }}
    />
  </RailHeight>
)
