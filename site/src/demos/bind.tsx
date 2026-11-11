import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

function Stepper(props: { value?: number }) {
  let { value = 0 } = props
  return (
    <p>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => value--}
      >
        −
      </Button>
      <strong> {value} </strong>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => value++}
      >
        +
      </Button>
    </p>
  )
}

export default function Guests() {
  const guests = state(2)
  return (
    <Card title="Table for">
      <Stepper bind:value={guests} />
      <p>Booked for {guests.value} people</p>
    </Card>
  )
}
