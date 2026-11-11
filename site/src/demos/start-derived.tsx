import { derived, state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

export default function Order() {
  const price = 4
  const cups = state(1)
  const total = derived(() => cups.value * price)
  const label = derived(() =>
    cups.value === 1 ? '1 cup' : `${cups.value} cups`,
  )
  return (
    <Card title="Your order">
      <p>
        {label.value}, ${total.value}
      </p>
      <Button onClick={() => cups.value++}>
        One more
      </Button>{' '}
      <Button
        emphasis="ghost"
        tone="neutral"
        disabled={cups.value === 1}
        onClick={() => cups.value--}
      >
        One fewer
      </Button>
    </Card>
  )
}
