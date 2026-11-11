import { state } from '@kerf-js/core'
import { Switch } from '@kerf-js/veneer'

export function SwitchBasic() {
  const on = state(true)
  return (
    <Switch
      checked={on.value}
      onChange={(
        e: Event & { currentTarget: HTMLInputElement },
      ) => (on.value = e.currentTarget.checked)}
    >
      Preview deploys
    </Switch>
  )
}
