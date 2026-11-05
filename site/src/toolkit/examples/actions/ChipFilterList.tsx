import { state } from '@weft-js/core'
import { Chip, Row, Stack, Text } from '@weft-js/warp'
import { PROJECTS } from '../../world'

export function ChipFilterList() {
  const on = state(['Failed', 'Building'])
  const flip = (name: string) =>
    (on.value = on.value.includes(name) ? on.value.filter((n) => n !== name) : [...on.value, name])
  const shown = () =>
    PROJECTS.filter((p) => !on.value.length || on.value.includes(p.status)).slice(0, 4)
  return (
    <Stack gap="group">
      <Row gap="tight">
        {['Live', 'Building', 'Failed'].map((name) => (
          <Chip key={name} pressed={on.value.includes(name)} onClick={() => flip(name)}>
            {name}
          </Chip>
        ))}
      </Row>
      <Stack gap="tight">
        {shown().map((p) => (
          <Row key={p.id} justify="between">
            <Text>{p.name}</Text>
            <Text subtle>{p.status}</Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}
