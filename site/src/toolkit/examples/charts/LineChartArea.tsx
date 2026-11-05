import { LineChart } from '@weft-js/warp'

import { TRAFFIC } from '../../world'

import {
  dollars,
  thousands,
  COST_LINE,
} from './shared-dollars'

export const LineChartArea = () => (
  <LineChart
    title="Monthly bill"
    description={
      'Filled to zero, so the height ' + 'means something'
    }
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
