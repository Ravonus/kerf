import { state } from '@weft-js/core'
import { Segmented } from '@weft-js/warp'
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
