import { DonutChart } from '@kerf/veneer'

import { PLAN_MIX } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const DonutChartPlans = () => (
  <DonutChart
    title="Teams by plan"
    data={PLAN_MIX}
    name="Plan"
    unit="teams"
    pie
  />
)
