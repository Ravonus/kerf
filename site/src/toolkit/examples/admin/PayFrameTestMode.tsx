import { PayFrame } from '@kerf-js/veneer'
import { providerFields } from './shared'

export const PayFrameTestMode = () => (
  <PayFrame
    title="Card fields from your payment provider"
    testMode
    ready
    mount={providerFields}
  />
)
