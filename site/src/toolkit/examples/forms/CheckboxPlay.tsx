import { state, untrack } from '@kerf-js/core'
import { Checkbox } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export function CheckboxPlay(p: Knobs) {
  const on = state(untrack(() => !!p.checked))
  return (
    <Checkbox
      {...p}
      hint={p.hint || undefined}
      checked={on.value}
      onChange={(
        e: Event & { currentTarget: HTMLInputElement },
      ) => (on.value = e.currentTarget.checked)}
    >
      {p.children}
    </Checkbox>
  )
}
