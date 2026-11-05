import { state } from '@weft-js/core'
import {
  RadioGroup,
  Row,
  Slider,
  Stack,
  Text,
} from '@weft-js/warp'
import { PLANS, SEAT } from './shared'

export function RadioGroupPlan() {
  const plan = state('team')
  const seats = state(8)
  return (
    <Stack gap="group">
      <RadioGroup
        label="Plan"
        value={plan.value}
        options={PLANS}
        onChange={(v) => (plan.value = v)}
      />
      <Slider
        label="Seats"
        value={seats.value}
        min={1}
        max={40}
        onChange={(v) => (seats.value = v)}
      />
      <Row justify="between">
        <Text subtle>Per month</Text>
        <Text role="heading">
          €{SEAT[plan.value]! * seats.value}
        </Text>
      </Row>
    </Stack>
  )
}
