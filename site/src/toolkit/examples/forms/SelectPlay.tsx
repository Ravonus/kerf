import { Select } from '@kerf-js/veneer'
import { REGION_OPTIONS } from './shared'
import type { Knobs } from './shared'

export const SelectPlay = (p: Knobs) => (
  <Select
    options={REGION_OPTIONS}
    {...p}
    hint={p.hint || undefined}
  />
)
