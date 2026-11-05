import { WaterfallChart } from '@weft-js/warp'

import { SEATS_BRIDGE } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const WaterfallChartSeats = () => (
  <WaterfallChart
    title="Paying seats, Q3 to Q4"
    description="What moved the count"
    data={SEATS_BRIDGE}
  />
)
