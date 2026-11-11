import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

function Price({ dollars }: { dollars: number }) {
  return <strong>${dollars.toFixed(2)}</strong>
}

export default function Tip() {
  const bill = state(40)
  return (
    <Card title="Split the bill">
      <p>
        Each of you pays{' '}
        <Price dollars={bill.value / 2} />
      </p>
      <Button onClick={() => (bill.value += 10)}>
        Add a $10 dish
      </Button>
    </Card>
  )
}
