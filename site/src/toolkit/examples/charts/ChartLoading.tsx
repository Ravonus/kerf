import { bar } from '@weft-js/warp-core/charts'

import { Chart } from '@weft-js/warp'

import { dollars as _Shared0 } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const ChartLoading = () => (
  <Chart form={bar} title="deploys" state="loading" data={[]} x="" series={[]} />
)
