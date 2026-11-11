import { state } from '@kerf-js/core'
import { ContextMeter } from '@kerf-js/veneer'
import { CONTEXT } from '../../world'

export function ContextMeterCompact() {
  const used = state(186000)
  return (
    <ContextMeter
      used={used.value}
      limit={200000}
      parts={CONTEXT.parts}
      showTokens
      onCompact={() => (used.value = 38000)}
    />
  )
}
