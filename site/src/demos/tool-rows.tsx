import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const FRUIT = ['Apple', 'Banana', 'Cherry', 'Damson', 'Fig']

// How many times each row's quantity has been worked out. A plain object, so counting isn't itself a state write.
const runs: Record<string, number> = {}
const counted = (id: string, qty: number) => {
  const n = (runs[id] ?? 0) + 1
  runs[id] = n
  return `${qty} in cart, worked out ${n} times`
}

export default function Rows() {
  const cart = state<Record<string, number>>({})
  const add = (id: string) => cart.set(d => { d[id] = (d[id] ?? 0) + 1 })
  return (
    <Card title="One entry per row">
      <ul>
        {FRUIT.map(id => (
          <li key={id}>
            {id}: {counted(id, cart.get(id) ?? 0)}{' '}
            <Button size="sm" emphasis="ghost" onClick={() => add(id)}>Add</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
