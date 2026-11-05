import { Select } from '@weft-js/warp'
import { REGION_OPTIONS } from './shared'
import type { Knobs } from './shared'

export const SelectPlay = (p: Knobs) => (
  <Select
    options={REGION_OPTIONS}
    {...p}
    hint={p.hint || undefined}
  />
)
