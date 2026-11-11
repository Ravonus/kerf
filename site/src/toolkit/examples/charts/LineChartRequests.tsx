import { LineChart } from '@kerf/veneer'

import { REQUESTS_BY_REGION } from '../../world'

import {
  millions,
  REGION_LINES,
  LAUNCH,
  TARGET,
} from './shared-dollars'

export const LineChartRequests = () => (
  <LineChart
    title="Requests by region"
    description="Millions a month"
    data={REQUESTS_BY_REGION}
    x="month"
    xName="Month"
    series={REGION_LINES}
    format={millions}
    annotations={LAUNCH}
    references={TARGET}
  />
)
