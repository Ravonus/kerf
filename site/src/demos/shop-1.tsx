import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

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
