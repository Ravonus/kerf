import { derived, state } from '@weft-js/core'
import { Checkbox, Stack } from '@weft-js/warp'
import { EVENTS } from './shared'

export function CheckboxSelectAll() {
  const on = state(['Deploy failed', 'Uptime drops'])
  const flip = (name: string) =>
    (on.value = on.value.includes(name)
      ? on.value.filter((n) => n !== name)
      : [...on.value, name])
  const all = derived(
    () => on.value.length === EVENTS.length,
  )
  return (
    <Stack gap="tight">
      <Checkbox
        checked={all.value}
        indeterminate={on.value.length > 0 && !all.value}
        onChange={() =>
          (on.value = all.value ? [] : EVENTS)
        }
      >
        Email me about
      </Checkbox>
      <Stack
        gap="tight"
        style={
          'padding-inline-start:' +
          'var(--warp-space-group)'
        }
      >
        {EVENTS.map((name) => (
          <Checkbox
            key={name}
            checked={on.value.includes(name)}
            onChange={() => flip(name)}
          >
            {name}
          </Checkbox>
        ))}
      </Stack>
    </Stack>
  )
}
