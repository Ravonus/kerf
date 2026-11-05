import { HeatGrid } from '@weft-js/warp'

import { DEPLOY_HEAT, DEPLOY_WEEKS } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const HeatGridDeploys = () => (
  <HeatGrid
    title="Deploys per day"
    description="Last 26 weeks"
    data={DEPLOY_HEAT}
    weeks={DEPLOY_WEEKS}
    unit="deploys"
  />
)
