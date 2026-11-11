import { state } from '@kerf-js/core'
import { Segmented } from '@kerf-js/veneer'
import { PERIODS } from './shared'

export function SegmentedSizes() {
  const v = state('week')
  return (
    <>
      <Segmented
        label="Period"
        size="sm"
        value={v.value}
        options={PERIODS}
        onChange={(next) => (v.value = next)}
      />
      <Segmented
        label="Period"
        value={v.value}
        options={PERIODS}
        onChange={(next) => (v.value = next)}
      />
    </>
  )
}
