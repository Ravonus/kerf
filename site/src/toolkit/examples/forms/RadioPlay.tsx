import { state } from '@weft-js/core'
import { Radio, Stack } from '@weft-js/warp'
import type { Knobs } from './shared'

export function RadioPlay(p: Knobs) {
  const on = state('a')
  return (
    <Stack gap="tight">
      <Radio
        {...p}
        hint={p.hint || undefined}
        name="radio-play"
        checked={on.value === 'a'}
        onChange={() => (on.value = 'a')}
      >
        {p.children}
      </Radio>
      <Radio
        name="radio-play"
        checked={on.value === 'b'}
        onChange={() => (on.value = 'b')}
      >
        Roll out in steps
      </Radio>
    </Stack>
  )
}
