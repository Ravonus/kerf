import { state } from '@kerf/core'
import { Segmented } from '@kerf/veneer'
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
