import { state } from '@weft-js/core'
import { Switch } from '@weft-js/warp'

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
