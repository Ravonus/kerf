import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

function Line(props: { item: string; qty: number }) {
  const item = props.item // another name for the prop: always current
  let qty = props.qty // a local you can change, until the parent changes it
  return (
    <p>
      {item} × {qty}{' '}
      <Button size="sm" emphasis="ghost" tone="neutral" onClick={() => qty++}>
        +1 here
      </Button>
    </p>
  )
}

export default function Order() {
  const qty = state(1)
  return (
    <Card title="An order line">
      <Line item="Espresso" qty={qty.value} />
      <p>The parent says {qty.value}</p>
      <Button onClick={() => qty.value++}>+1 in the parent</Button>
    </Card>
  )
}
