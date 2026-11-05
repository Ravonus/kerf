import { state } from '@weft-js/core'
import { RadioGroup } from '@weft-js/warp'

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
