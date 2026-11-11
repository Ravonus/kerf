import { DonutChart } from '@kerf/veneer'

import { PROJECT_COSTS } from '../../world'

import { dollars } from './shared-dollars'

export const DonutChartCost = () => (
  <DonutChart
    title="Top six projects by cost"
    data={PROJECT_COSTS}
    name="Project"
    format={dollars}
  />
)
