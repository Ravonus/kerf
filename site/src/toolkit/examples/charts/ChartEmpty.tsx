import { bar } from '@kerf-js/veneer-core/charts'

import { Chart } from '@kerf-js/veneer'

import { dollars as _Shared0 } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const ChartEmpty = () => (
  <Chart
    form={bar}
    title="deploys"
    empty={{
      title: 'No deploys in this range',
      detail: 'Try the last 90 days.',
    }}
    data={[]}
    x=""
    series={[]}
  />
)
