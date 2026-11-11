import { state } from '@kerf/core'
import { RadioGroup } from '@kerf/veneer'

/** Short choices need no hints: the labels say it all. */
export function RadioGroupPlain() {
  const branch = state('main')
  return (
    <RadioGroup
      label="Deploy from"
      value={branch.value}
      options={[
        { value: 'main', label: 'main' },
        { value: 'release', label: 'release' },
        { value: 'tags', label: 'Tagged commits only' },
      ]}
      onChange={(v) => (branch.value = v)}
    />
  )
}
