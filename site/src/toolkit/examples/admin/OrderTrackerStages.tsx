import { state } from '@kerf/core'
import {
  OrderTracker,
  Segmented,
  Stack,
} from '@kerf/veneer'
import type { OrderStage } from '@kerf/veneer'
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
