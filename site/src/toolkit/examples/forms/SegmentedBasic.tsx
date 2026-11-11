import { state } from '@kerf-js/core'
import { Segmented } from '@kerf-js/veneer'
import { PERIODS } from './shared'

export function SegmentedBasic() {
  const v = state('week')
  return (
    <Segmented
      label="Period"
      value={v.value}
      options={PERIODS}
      onChange={(next) => (v.value = next)}
    />
  )
}
