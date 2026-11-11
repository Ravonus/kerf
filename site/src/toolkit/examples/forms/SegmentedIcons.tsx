import { state } from '@kerf/core'
import { Segmented } from '@kerf/veneer'
import { VIEWS } from './shared'

export function SegmentedIcons() {
  const v = state('list')
  return (
    <Segmented
      label="View"
      value={v.value}
      options={VIEWS}
      onChange={(next) => (v.value = next)}
    />
  )
}
