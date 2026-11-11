import { state } from '@kerf/core'
import { Checkbox } from '@kerf/veneer'

export function CheckboxBasic() {
  const on = state(true)
  return (
    <Checkbox
      checked={on.value}
      onChange={(
        e: Event & { currentTarget: HTMLInputElement },
      ) => (on.value = e.currentTarget.checked)}
    >
      Deploy on push
    </Checkbox>
  )
}
