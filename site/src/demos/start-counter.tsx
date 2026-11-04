import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

function CupCounter() {
  const cups = state(0)
  return (
    <p>
      <Button onClick={() => cups.value++}>Pour a cup</Button> Poured {cups.value}{' '}
      {cups.value === 1 ? 'cup' : 'cups'}
    </p>
  )
}

export default function Counters() {
  return (
    <Card title="Two baristas">
      <CupCounter />
      <CupCounter />
    </Card>
  )
}
