import { ComboChart } from '@kerf/veneer'

import { TRAFFIC } from '../../world'

import { dollars, thousands } from './shared-dollars'

// -- The rest, one form each

export const ComboChartRequests = () => (
  <ComboChart
    title="Monthly bill"
    description={
      'Bars for each month, the line ' +
      'for the three-month average'
    }
    data={TRAFFIC}
    x="month"
    xName="Month"
    bar={{ key: 'cost', name: 'Bill' }}
    window={3}
    format={dollars}
    axisFormat={thousands}
  />
)
