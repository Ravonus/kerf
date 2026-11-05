import { RadarChart } from '@weft-js/warp'

import { SKILLS } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const RadarChartHealth = () => (
  <RadarChart
    title="Project health"
    description="Each score out of 100"
    data={SKILLS.data}
    axes={SKILLS.axes}
  />
)
