import { GaugeChart } from '@weft-js/warp'

import { dollars as _Shared0 } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const GaugeChartBudget = () => (
  <GaugeChart
    title="Error budget used"
    description="30 days, storefront"
    data={0.64}
    label="Used"
  />
)
