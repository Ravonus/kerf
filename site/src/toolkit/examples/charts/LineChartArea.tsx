import { LineChart } from '@kerf/veneer'

import { TRAFFIC } from '../../world'

import {
  dollars,
  thousands,
  COST_LINE,
} from './shared-dollars'

const description =
  'Filled to zero, so the height means something'

export const LineChartArea = () => (
  <LineChart
    title="Monthly bill"
    description={description}
    data={TRAFFIC}
    x="month"
    xName="Month"
    series={COST_LINE}
    format={dollars}
    axisFormat={thousands}
    area
    zero
  />
)
