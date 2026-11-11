import { BarChart } from '@kerf/veneer'

import { DEPLOYS_BY_TEAM } from '../../world'

import { TEAMS } from './shared-dollars'

// -- BarChart

export const BarChartPlay = (p: {
  layout?: 'grouped' | 'stacked' | 'percent'
}) => (
  <BarChart
    title="Deploys by team"
    data={DEPLOYS_BY_TEAM}
    x="quarter"
    xName="Quarter"
    series={TEAMS}
    {...p}
  />
)
