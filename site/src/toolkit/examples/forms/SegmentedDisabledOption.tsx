import { state } from '@kerf-js/core'
import { Segmented } from '@kerf-js/veneer'
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
