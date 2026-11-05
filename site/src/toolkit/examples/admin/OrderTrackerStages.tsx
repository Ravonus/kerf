import { state } from '@weft-js/core'
import { OrderTracker, Segmented, Stack } from '@weft-js/warp'
import type { OrderStage } from '@weft-js/warp'
import { STAGES } from './shared'

export function OrderTrackerStages() {
  const stage = state<OrderStage>('shipped')
  return (
    <Stack gap="group">
      <OrderTracker stage={stage.value} />
      <Segmented
        label="Stage"
        size="sm"
        value={stage.value}
        options={STAGES}
        onChange={(v) => (stage.value = v)}
      />
    </Stack>
  )
}
