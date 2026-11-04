import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

// Every <Counter /> runs this function once, so each one makes its own box.
function Counter(props: { label: string }) {
  const count = state(0)
  return (
    <p>
      {props.label} <Badge count>{count.value}</Badge>{' '}
      <Button size="sm" emphasis="outline" onClick={() => count.value++}>
        +1
      </Button>
    </p>
  )
}

export default function Two() {
  return (
    <Card title="Same component, two boxes">
      <Counter label="Coffee" />
      <Counter label="Tea" />
    </Card>
  )
}
