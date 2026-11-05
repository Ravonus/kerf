import { DonutChart } from '@weft-js/warp'

import { REGION_SLICES } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

// -- DonutChart

export const DonutChartRegions = () => (
  <DonutChart
    title="Requests by region"
    description="October, in millions"
    data={REGION_SLICES}
    name="Region"
    unit="million"
  />
)
