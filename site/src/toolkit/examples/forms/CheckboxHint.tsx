import { state } from '@kerf-js/core'
import { Checkbox } from '@kerf-js/veneer'

export function CheckboxHint() {
  const on = state(false)
  return (
    <Checkbox
      checked={on.value}
      hint="Failed checks stop the deploy."
      onChange={(
        e: Event & { currentTarget: HTMLInputElement },
      ) => (on.value = e.currentTarget.checked)}
    >
      Require checks to pass
    </Checkbox>
  )
}
