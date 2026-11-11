import { derived, state, type State } from '@kerf-js/core'
import { Button, Card, Row } from '@kerf-js/veneer'

type Product = { id: string; name: string }
const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Kettle' },
  { id: 'p2', name: 'Teapot' },
  { id: 'p3', name: 'Strainer' },
]

// Reads its own entry from the whole box, so a change
// to another product never re-runs this row.
function Line({
  product,
  cart,
}: {
  product: Product
  cart: State<Record<string, number>>
}) {
  const qty = derived(() => cart.get(product.id) ?? 0)
  const add = () =>
    cart.set((d) => {
      d[product.id] = qty.value + 1
    })
  const remove = () =>
    cart.set((d) => {
      d[product.id] = Math.max(0, qty.value - 1)
    })
  return (
    <Row
      gap="tight"
      align="baseline"
    >
      <span>
        {product.name}: {qty.value}
      </span>
      <Button
        size="sm"
        onClick={add}
      >
        +1
      </Button>
      <Button
        size="sm"
        emphasis="ghost"
        disabled={qty.value === 0}
        onClick={remove}
      >
        −1
      </Button>
    </Row>
  )
}

export default function Cart() {
  const cart = state<Record<string, number>>({})
  const count = derived(() =>
    Object.values(cart.value).reduce((a, b) => a + b, 0),
  )
  return (
    <Card title={`Cart: ${count.value} items`}>
      {PRODUCTS.map((p) => (
        <Line
          key={p.id}
          product={p}
          cart={cart}
        />
      ))}
    </Card>
  )
}
