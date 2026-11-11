import { derived, state, type State } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

const PRODUCTS = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  { id: 'filters', name: 'Paper filters', price: 5 },
  { id: 'grinder', name: 'Hand grinder', price: 40 },
  { id: 'mug', name: 'Enamel mug', price: 9 },
]

type Product = (typeof PRODUCTS)[number]
type Cart = Record<string, number>

function ProductRow({
  product,
  cart,
}: {
  product: Product
  cart: State<Cart>
}) {
  const qty = derived(() => cart.get(product.id) ?? 0)
  const change = (by: number) =>
    cart.set((d) => {
      d[product.id] = Math.max(
        0,
        (d[product.id] ?? 0) + by,
      )
    })
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
      <Button
        size="sm"
        emphasis="outline"
        disabled={qty.value === 0}
        onClick={() => change(-1)}
      >
        −
      </Button>
      <strong> {qty.value} </strong>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => change(1)}
      >
        +
      </Button>
    </p>
  )
}

export default function Shop() {
  const cart = state<Cart>({})
  return (
    <Card title="The shop">
      {PRODUCTS.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
          cart={cart}
        />
      ))}
    </Card>
  )
}
