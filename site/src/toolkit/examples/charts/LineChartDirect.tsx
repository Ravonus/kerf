import { LineChart } from '@kerf-js/veneer'

import { REQUESTS_BY_REGION } from '../../world'

import { millions, REGION_LINES } from './shared-dollars'

const description =
  "Named at the line's end, no legend to look up"

export const LineChartDirect = () => (
  <LineChart
    title="Requests by region"
    description={description}
    data={REQUESTS_BY_REGION}
    x="month"
    xName="Month"
    series={REGION_LINES}
    format={millions}
    direct
  />
)
