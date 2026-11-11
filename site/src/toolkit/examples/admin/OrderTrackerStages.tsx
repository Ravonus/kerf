import { state } from '@kerf-js/core'
import {
  OrderTracker,
  Segmented,
  Stack,
} from '@kerf-js/veneer'
import type { OrderStage } from '@kerf-js/veneer'
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
