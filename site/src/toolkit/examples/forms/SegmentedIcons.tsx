import { state } from '@kerf-js/core'
import { Segmented } from '@kerf-js/veneer'
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
