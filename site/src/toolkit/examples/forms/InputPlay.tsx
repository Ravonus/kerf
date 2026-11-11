import { Input } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export const InputPlay = (p: Knobs) => (
  <Input
    {...p}
    hint={p.hint || undefined}
  />
)
