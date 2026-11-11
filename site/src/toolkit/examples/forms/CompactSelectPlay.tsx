import { CompactSelect } from '@kerf-js/veneer'
import { REGION_OPTIONS } from './shared'
import type { Knobs } from './shared'

export function CompactSelectPlay(p: Knobs) {
  return (
    <CompactSelect
      options={REGION_OPTIONS}
      {...p}
      placeholder={p.placeholder || undefined}
    />
  )
}
