import { BarChart } from '@kerf/veneer'

import { DEPLOYS_BY_TEAM } from '../../world'

import { TEAMS } from './shared-dollars'

export const BarChartDeploys = () => (
  <BarChart
    title="Deploys by team"
    description="Last five quarters"
    data={DEPLOYS_BY_TEAM}
    x="quarter"
    xName="Quarter"
    series={TEAMS}
  />
)
