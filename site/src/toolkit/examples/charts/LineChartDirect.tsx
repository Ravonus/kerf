import { LineChart } from '@weft-js/warp'

import { REQUESTS_BY_REGION } from '../../world'

import { millions, REGION_LINES } from './shared-dollars'

export const LineChartDirect = () => (
  <LineChart
    title="Requests by region"
    description="Named at the line's end, no legend to look up"
    data={REQUESTS_BY_REGION}
    x="month"
    xName="Month"
    series={REGION_LINES}
    format={millions}
    direct
  />
)
