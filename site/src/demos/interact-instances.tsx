import { state } from '@kerf/core'
import { Badge, Button, Card } from '@kerf/veneer'

// Each <Counter /> runs this function once, making
// its own box.
function Counter({ label }: { label: string }) {
  const count = state(0)
  return (
    <p>
      {label} <Badge count>{count.value}</Badge>{' '}
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => count.value++}
      >
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
