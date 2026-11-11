import { ContextMeter } from '@kerf-js/veneer'

export const ContextMeterLevels = () => (
  <>
    <ContextMeter
      used={64000}
      limit={200000}
      showTokens
    />
    <ContextMeter
      used={168000}
      limit={200000}
      showTokens
    />
    <ContextMeter
      used={194000}
      limit={200000}
      showTokens
    />
  </>
)
