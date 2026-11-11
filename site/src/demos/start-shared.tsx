import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

function CupButton(props: { cups?: number }) {
  let { cups = 0 } = props
  return (
    <Button onClick={() => cups++}>Poured {cups}</Button>
  )
}

export default function Cafe() {
  const cups = state(0)
  return (
    <Card title="One count, shared">
      <p>
        <CupButton bind:cups={cups} />{' '}
        <CupButton bind:cups={cups} />
      </p>
      <p>The café has poured {cups.value} cups today.</p>
      <p>
        Without bind: <CupButton cups={cups.value} />
      </p>
    </Card>
  )
}
