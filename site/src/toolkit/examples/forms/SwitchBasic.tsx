import { state } from '@kerf/core'
import { Switch } from '@kerf/veneer'

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
