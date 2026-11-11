import { state } from '@kerf/core'
import { RadioGroup } from '@kerf/veneer'
import { WINDOWS } from './shared'

export function RadioGroupWindow() {
  const when = state<'now' | 'night' | 'weekend'>('now')
  return (
    <RadioGroup
      label="Maintenance window"
      value={when.value}
      options={[...WINDOWS]}
      onChange={(v) => (when.value = v)}
    />
  )
}
