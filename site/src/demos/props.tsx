import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

function Price(props: { dollars: number }) {
  return <strong>${props.dollars.toFixed(2)}</strong>
}

export default function Tip() {
  const bill = state(40)
  return (
    <Card title="Split the bill">
      <p>Each of you pays <Price dollars={bill.value / 2} /></p>
      <Button onClick={() => (bill.value += 10)}>Add a $10 dish</Button>
    </Card>
  )
}
