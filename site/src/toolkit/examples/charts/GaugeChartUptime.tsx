import { GaugeChart, Grid } from '@weft-js/warp'

import { dollars as _Shared0 } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const GaugeChartUptime = () => (
  <Grid min="md" cols={2} gap="group">
    <GaugeChart title="Error budget used" data={0.42} />
    <GaugeChart title="Build minutes used" data={0.87} />
  </Grid>
)
