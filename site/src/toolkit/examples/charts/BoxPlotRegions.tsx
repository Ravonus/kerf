import { BoxPlot } from '@weft-js/warp'

import { LATENCY_BY_REGION } from '../../world'

import { ms } from './shared-dollars'

export const BoxPlotRegions = () => (
  <BoxPlot
    title="Latency by region"
    description="Last hour"
    data={LATENCY_BY_REGION}
    format={ms}
  />
)
