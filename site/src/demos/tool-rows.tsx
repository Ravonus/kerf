import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

const FRUIT = [
  'Apple',
  'Banana',
  'Cherry',
  'Damson',
  'Fig',
]

// How often each row's quantity is worked out. A plain
// object keeps counting from making a state write.
const runs: Record<string, number> = {}
const counted = (id: string, qty: number) => {
  const n = (runs[id] ?? 0) + 1
  runs[id] = n
  return `${qty} in cart, worked out ${n} times`
}

export default function Rows() {
  const cart = state<Record<string, number>>({})
  const add = (id: string) =>
    cart.set((d) => {
      d[id] = (d[id] ?? 0) + 1
    })
  return (
    <Card title="One entry per row">
      <ul>
        {FRUIT.map((id) => (
          <li key={id}>
            {id}: {counted(id, cart.get(id) ?? 0)}{' '}
            <Button
              size="sm"
              emphasis="ghost"
              onClick={() => add(id)}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
