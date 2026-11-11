import { Textarea } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export const TextareaPlay = (p: Knobs) => (
  <Textarea
    {...p}
    hint={p.hint || undefined}
  />
)
