import { CandlestickChart } from '@kerf-js/veneer'

import { LATENCY_DAYS } from '../../world'

import { ms } from './shared-dollars'

export const CandlestickChartLatency = () => (
  <CandlestickChart
    title="Checkout p95 latency"
    description="Open, high, low and close for each day"
    data={LATENCY_DAYS}
    format={ms}
  />
)
