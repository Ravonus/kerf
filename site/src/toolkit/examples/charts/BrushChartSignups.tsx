import { BrushChart } from '@kerf-js/veneer'

import { SIGNUPS_DAILY } from '../../world'

import { TICKS, GOAL_LINE } from './shared-dollars'

export const BrushChartSignups = () => (
  <BrushChart
    title="Signups per day"
    description="Drag across the lower strip to zoom"
    data={SIGNUPS_DAILY}
    x="day"
    y="signups"
    name="Signups"
    domain={[80, 220]}
    ticks={TICKS}
    target={GOAL_LINE}
    annotation="First day over target"
  />
)
