import { state } from 'weft'
import { Badge, Button, Card } from '@weft/warp'

export default function Shop() {
  const count = state(0)
  return (
    <Card title="Coffee, $12">
      <Button onClick={() => count.value++}>Add to cart</Button>
      <Badge count>{count.value}</Badge>
    </Card>
  )
}
