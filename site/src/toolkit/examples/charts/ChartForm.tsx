import { line } from '@kerf-js/veneer-core/charts'

import { Chart } from '@kerf-js/veneer'

import { TRAFFIC } from '../../world'

import { dollars, COST_LINE } from './shared-dollars'

// -- Chart

export const ChartForm = () => (
  <Chart
    form={line}
    title="Monthly bill"
    data={TRAFFIC}
    x="month"
    xName="Month"
    series={COST_LINE}
    format={dollars}
  />
)
