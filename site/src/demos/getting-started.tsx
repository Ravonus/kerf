import { state } from '@kerf/core'
import { Badge, Button, Card } from '@kerf/veneer'

export default function Product() {
  const inCart = state(0)
  return (
    <Card
      eyebrow="Coffee"
      title="House blend, 250 g"
    >
      <p>
        Cart <Badge count>{inCart.value}</Badge>
      </p>
      <Button onClick={() => inCart.value++}>
        Add to cart
      </Button>
    </Card>
  )
}
