import { state, untrack } from '@weft-js/core'
import { Chip } from '@weft-js/warp'

export function ChipPlay(p: {
  children: string
  pressed: boolean
  count: number
}) {
  const on = state(untrack(() => p.pressed))
  return (
    <Chip
      pressed={on.value}
      count={p.count < 0 ? undefined : p.count}
      onClick={() => (on.value = !on.value)}
    >
      {p.children}
    </Chip>
  )
}
