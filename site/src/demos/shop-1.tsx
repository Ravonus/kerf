import { state } from '@kerf-js/core'
import { Badge, Button, Card } from '@kerf-js/veneer'

export default function Shop() {
  const count = state(0)
  return (
    <Card title="Coffee, $12">
      <Button onClick={() => count.value++}>
        Add to cart
      </Button>
      <Badge count>{count.value}</Badge>
    </Card>
  )
}
