import { BarChart } from '@kerf/veneer'

import { COST_BY_SERVICE } from '../../world'

import { dollars, SERVICES } from './shared-dollars'

export const BarChartStacked = () => (
  <BarChart
    title="Monthly bill by service"
    description="November to October"
    data={COST_BY_SERVICE}
    x="month"
    xName="Month"
    series={SERVICES}
    layout="stacked"
    format={dollars}
  />
)
