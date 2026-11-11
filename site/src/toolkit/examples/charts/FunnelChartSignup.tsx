import { FunnelChart } from '@kerf-js/veneer'

import { SIGNUP_FUNNEL } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const FunnelChartSignup = () => (
  <FunnelChart
    title="From pricing page to paid"
    description="Last 90 days"
    data={SIGNUP_FUNNEL}
    unit="Teams"
  />
)
