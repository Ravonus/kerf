import { state, untrack } from '@weft-js/core'
import { Toggle } from '@weft-js/warp'

export function TogglePlay(p: { children: string; pressed: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const on = state(untrack(() => p.pressed))
  return (
    <Toggle size={p.size} pressed={on.value} onClick={() => (on.value = !on.value)}>
      {p.children}
    </Toggle>
  )
}
