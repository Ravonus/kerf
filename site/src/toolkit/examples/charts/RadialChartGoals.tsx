import { RadialChart } from '@weft-js/warp'

import { GOALS } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const RadialChartGoals = () => (
  <RadialChart
    title="Q4 goals"
    description="Share of each target reached"
    data={GOALS}
  />
)
