import { state } from '@weft-js/core'
import { Segmented } from '@weft-js/warp'
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
