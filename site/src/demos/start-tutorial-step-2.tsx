import { state, type State } from '@kerf-js/core'
import { Badge, Button, Card } from '@kerf-js/veneer'

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
  const add = () =>
    cart.set((d) => {
      d[product.id] = (d[product.id] ?? 0) + 1
    })
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
      <Button
        size="sm"
        onClick={add}
      >
        Add
      </Button>
      <Badge count>{cart.get(product.id) ?? 0}</Badge>
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
