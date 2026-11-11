import { Card, Row, Text } from '@kerf/veneer'
import { TWO_PLANS } from './shared'

export const PlanPickerTile = () => (
  <Row gap="related">
    {TWO_PLANS.map((plan) => (
      <Card
        key={plan.id}
        title={plan.name}
      >
        <Text subtle>${plan.price} per seat</Text>
      </Card>
    ))}
  </Row>
)
