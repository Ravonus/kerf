import { BarChart } from '@kerf-js/veneer'

import { DEPLOYS_BY_TEAM } from '../../world'

import { TEAMS } from './shared-dollars'

export const BarChartPercent = () => (
  <BarChart
    title="Deploys by team"
    description="Each quarter as a share of its deploys"
    data={DEPLOYS_BY_TEAM}
    x="quarter"
    xName="Quarter"
    series={TEAMS}
    layout="percent"
  />
)
