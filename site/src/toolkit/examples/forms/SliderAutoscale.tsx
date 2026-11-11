import { state } from '@kerf-js/core'
import { Row, Slider, Stack, Text } from '@kerf-js/veneer'
import { COPY_COST } from './shared'

export function SliderAutoscale() {
  const copies = state<[number, number]>([2, 6])
  return (
    <Stack gap="group">
      <Slider
        label="Keep between"
        value={copies.value}
        min={1}
        max={12}
        names={['Fewest copies', 'Most copies']}
        onChange={(v) => (copies.value = v)}
      />
      <Stack gap="tight">
        <Row justify="between">
          <Text subtle>When quiet</Text>
          <Text>
            €{copies.value[0] * COPY_COST} a month
          </Text>
        </Row>
        <Row justify="between">
          <Text subtle>At full load</Text>
          <Text>
            €{copies.value[1] * COPY_COST} a month
          </Text>
        </Row>
      </Stack>
    </Stack>
  )
}
