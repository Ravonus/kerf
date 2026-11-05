import { state } from '@weft-js/core'
import { Chip, Popover, Row, Text } from '@weft-js/warp'
import { STATUSES } from './shared'

export function PopoverFilter() {
  const on = state(['Failed'])
  const flip = (s: string) =>
    (on.value = on.value.includes(s) ? on.value.filter((x) => x !== s) : [...on.value, s])
  return (
    <Row gap="related">
      <Popover
        label={`Status (${on.value.length})`}
        trigger={{ icon: 'filter' }}
        title="Show deploys that are"
      >
        <Row gap="tight">
          {STATUSES.map((s) => (
            <Chip key={s} pressed={on.value.includes(s)} onClick={() => flip(s)}>
              {s}
            </Chip>
          ))}
        </Row>
      </Popover>
      <Text subtle>{on.value.join(', ') || 'Everything'}</Text>
    </Row>
  )
}
