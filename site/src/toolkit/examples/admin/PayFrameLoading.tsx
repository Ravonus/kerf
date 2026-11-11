import { PayFrame } from '@kerf-js/veneer'

export const PayFrameLoading = () => (
  <PayFrame
    title={[
      'Card fields from your ',
      'payment provider',
    ].join('')}
  />
)
