import { ScatterChart } from '@kerf-js/veneer'

import { PROJECT_POINTS } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const ScatterChartProjects = () => (
  <ScatterChart
    title="Busy projects stay fast"
    description="Each dot is one project"
    data={PROJECT_POINTS}
    xName="Deploys"
    yName="Latency (ms)"
  />
)
