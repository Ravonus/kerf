import { state } from '@kerf/core'
import { Segmented } from '@kerf/veneer'
import { LOGS } from './shared'

export function SegmentedDisabledOption() {
  const v = state('all')
  return (
    <Segmented
      label="Logs"
      value={v.value}
      options={LOGS}
      onChange={(next) => (v.value = next)}
    />
  )
}
