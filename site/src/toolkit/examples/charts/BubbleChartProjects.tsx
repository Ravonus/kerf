import { BubbleChart } from '@kerf-js/veneer'

import { PROJECT_POINTS } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const BubbleChartProjects = () => (
  <BubbleChart
    title="Deploys, latency and cost"
    description="Bigger bubbles cost more"
    data={PROJECT_POINTS}
    xName="Deploys"
    yName="Latency (ms)"
    sizeName="Cost ($100s)"
  />
)
