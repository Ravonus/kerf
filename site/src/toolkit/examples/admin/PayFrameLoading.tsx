import { PayFrame } from '@kerf/veneer'

export const PayFrameLoading = () => (
  <PayFrame
    title={[
      'Card fields from your ',
      'payment provider',
    ].join('')}
  />
)
