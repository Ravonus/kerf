import { state, untrack } from '@kerf-js/core'
import { Switch } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export function SwitchPlay(p: Knobs) {
  const on = state(untrack(() => !!p.checked))
  return (
    <Switch
      {...p}
      hint={p.hint || undefined}
      checked={on.value}
      onChange={(
        e: Event & { currentTarget: HTMLInputElement },
      ) => (on.value = e.currentTarget.checked)}
    >
      {p.children}
    </Switch>
  )
}
