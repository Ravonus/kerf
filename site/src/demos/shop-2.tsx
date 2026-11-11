import { derived, state } from '@kerf/core'
import { Badge, Button, Card } from '@kerf/veneer'

export default function Shop() {
  const count = state(0)
  const total = derived(() => count.value * 12)
  const shipping = derived(() =>
    total.value === 0 || total.value >= 36 ? 0 : 4,
  )
  return (
    <Card title="Coffee, $12">
      <Button onClick={() => count.value++}>
        Add to cart
      </Button>
      <Badge count>{count.value}</Badge>
      <p>Shipping ${shipping.value}</p>
      <p>
        <strong>
          Total ${total.value + shipping.value}
        </strong>
      </p>
    </Card>
  )
}
