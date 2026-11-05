import { state } from '@weft-js/core'
import { Checkbox } from '@weft-js/warp'

export function CheckboxHint() {
  const on = state(false)
  return (
    <Checkbox
      checked={on.value}
      hint="Failed checks stop the deploy."
      onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
        (on.value = e.currentTarget.checked)
      }
    >
      Require checks to pass
    </Checkbox>
  )
}
