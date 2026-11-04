import { derived, state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

const products = [
  { id: 1, name: 'Coffee', price: 12, count: state(0) },
  { id: 2, name: 'Filters', price: 5, count: state(0) },
  { id: 3, name: 'Grinder', price: 40, count: state(0) },
]

export default function Shop() {
  const total = derived(() =>
    products.reduce(
      (sum, p) => sum + p.count.value * p.price,
      0,
    ),
  )
  const shipping = derived(() =>
    total.value === 0 || total.value >= 36 ? 0 : 4,
  )
  return (
    <Card title="Shop">
      {products.map((p) => (
        <p key={p.id}>
          <Button
            size="sm"
            onClick={() => p.count.value++}
          >
            {p.name}, ${p.price}
          </Button>
          <Badge count>{p.count.value}</Badge>
        </p>
      ))}
      <p>Shipping ${shipping.value}</p>
      <p>
        <strong>
          Total ${total.value + shipping.value}
        </strong>
      </p>
    </Card>
  )
}
