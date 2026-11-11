import { state, untrack } from '@kerf-js/core'
import { Toggle } from '@kerf-js/veneer'

export function TogglePlay(p: {
  children: string
  pressed: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const on = state(untrack(() => p.pressed))
  return (
    <Toggle
      size={p.size}
      pressed={on.value}
      onClick={() => (on.value = !on.value)}
    >
      {p.children}
    </Toggle>
  )
}
