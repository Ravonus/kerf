import { derived, state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

export default function Basket() {
  const price = 12
  const qty = state(1)
  const shipping = derived(() => (qty.value >= 3 ? 0 : 4))
  const total = derived(
    () => price * qty.value + shipping.value,
  )
  return (
    <Card title="Your basket">
      <p>
        {qty.value} × $12 · shipping ${shipping.value}
      </p>
      <p>
        <strong>Total ${total.value}</strong>
      </p>
      <Button onClick={() => qty.value++}>Add one</Button>
      <Button
        emphasis="ghost"
        tone="neutral"
        onClick={() => (qty.value = 1)}
      >
        Reset
      </Button>
    </Card>
  )
}
