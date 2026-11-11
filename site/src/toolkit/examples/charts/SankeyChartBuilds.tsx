import { SankeyChart } from '@kerf-js/veneer'

import { BUILD_FLOW } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const SankeyChartBuilds = () => (
  <SankeyChart
    title="Where builds end up"
    description="October"
    data={BUILD_FLOW.data}
    nodes={BUILD_FLOW.nodes}
  />
)
