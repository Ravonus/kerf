import { state } from '@weft-js/core'
import { Segmented } from '@weft-js/warp'
import { PERIODS } from './shared'
import type { Knobs } from './shared'

export function SegmentedPlay(p: Knobs) {
  const v = state('week')
  return (
    <Segmented
      {...p}
      value={v.value}
      options={PERIODS}
      onChange={(next) => (v.value = next)}
    />
  )
}
