import { state } from '@kerf-js/core'
import { RadioGroup } from '@kerf-js/veneer'

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
