import { Histogram } from '@kerf/veneer'

import { LATENCIES } from '../../world'

import { ms } from './shared-dollars'

export const HistogramLatency = () => (
  <Histogram
    title="Storefront latency"
    description="240 requests, last hour"
    data={LATENCIES}
    binWidth={20}
    format={ms}
    name="Requests"
  />
)
