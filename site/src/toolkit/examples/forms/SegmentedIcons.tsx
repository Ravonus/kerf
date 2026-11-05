import { state } from '@weft-js/core'
import { Segmented } from '@weft-js/warp'
import { VIEWS } from './shared'

export function SegmentedIcons() {
  const v = state('list')
  return (
    <Segmented label="View" value={v.value} options={VIEWS} onChange={(next) => (v.value = next)} />
  )
}
