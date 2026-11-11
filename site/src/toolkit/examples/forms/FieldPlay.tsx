import { Input } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export const FieldPlay = (p: Knobs) => (
  <Input
    {...p}
    hint={p.hint || undefined}
    error={p.error || undefined}
    icon={p.icon || undefined}
    prefix={p.prefix || undefined}
    suffix={p.suffix || undefined}
  />
)
