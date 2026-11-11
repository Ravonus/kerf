import { Radio, Row } from '@kerf/veneer'

export const RadioStates = () => (
  <Row
    gap="section"
    wrap
  >
    <Radio name="states-off">Canary</Radio>
    <Radio
      name="states-on"
      checked
    >
      Canary
    </Radio>
    <Radio
      name="states-off-d"
      disabled
    >
      Canary
    </Radio>
    <Radio
      name="states-on-d"
      checked
      disabled
    >
      Canary
    </Radio>
  </Row>
)
