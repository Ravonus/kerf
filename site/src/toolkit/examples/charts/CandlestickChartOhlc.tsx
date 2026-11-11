import { CandlestickChart } from '@kerf/veneer'

import { LATENCY_DAYS } from '../../world'

import { ms } from './shared-dollars'

export const CandlestickChartOhlc = () => (
  <CandlestickChart
    title="Checkout p95 latency"
    data={LATENCY_DAYS}
    format={ms}
    variant="ohlc"
  />
)
