import { state } from '@weft-js/core'
import { Slider } from '@weft-js/warp'
import type { Knobs } from './shared'

export function SliderPlay(p: Knobs) {
  const v = state(4)
  return <Slider {...p} value={v.value} onChange={(next: number) => (v.value = next)} />
}
