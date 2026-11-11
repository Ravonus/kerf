import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

function Line(props: { item: string; qty: number }) {
  // Another name for the prop: always current.
  const item = props.item
  // A local you can change until the parent changes it.
  let qty = props.qty
  return (
    <p>
      {item} × {qty}{' '}
      <Button
        size="sm"
        emphasis="ghost"
        tone="neutral"
        onClick={() => qty++}
      >
        +1 here
      </Button>
    </p>
  )
}

export default function Order() {
  const qty = state(1)
  return (
    <Card title="An order line">
      <Line
        item="Espresso"
        qty={qty.value}
      />
      <p>The parent says {qty.value}</p>
      <Button onClick={() => qty.value++}>
        +1 in the parent
      </Button>
    </Card>
  )
}
