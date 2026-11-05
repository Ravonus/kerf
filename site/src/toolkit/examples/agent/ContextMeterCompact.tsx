import { state } from '@weft-js/core'
import { ContextMeter } from '@weft-js/warp'
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
