import { PayFrame } from '@kerf/veneer'
import { providerFields } from './shared'

export const PayFrameTestMode = () => (
  <PayFrame
    title="Card fields from your payment provider"
    testMode
    ready
    mount={providerFields}
  />
)
