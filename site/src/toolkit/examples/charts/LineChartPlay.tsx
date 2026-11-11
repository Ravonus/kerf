import { LineChart } from '@kerf-js/veneer'

import { REQUESTS_BY_REGION } from '../../world'

import { millions, REGION_LINES } from './shared-dollars'

// -- LineChart

export const LineChartPlay = (p: {
  area?: boolean
  zero?: boolean
  direct?: boolean
}) => (
  <LineChart
    title="Requests by region"
    data={REQUESTS_BY_REGION}
    x="month"
    xName="Month"
    series={REGION_LINES}
    format={millions}
    {...p}
  />
)
