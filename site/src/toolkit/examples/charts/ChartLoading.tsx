import { bar } from '@kerf-js/veneer-core/charts'

import { Chart } from '@kerf-js/veneer'

import { dollars as _Shared0 } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const ChartLoading = () => (
  <Chart
    form={bar}
    title="deploys"
    state="loading"
    data={[]}
    x=""
    series={[]}
  />
)
