import { Input } from '@kerf/veneer'
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
