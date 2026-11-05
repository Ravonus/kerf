import { derived, state, type State } from '@weft-js/core'
import { Button, Card, Input } from '@weft-js/warp'

const PRODUCTS = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  { id: 'filters', name: 'Paper filters', price: 5 },
  { id: 'grinder', name: 'Hand grinder', price: 40 },
  { id: 'mug', name: 'Enamel mug', price: 9 },
]

type Product = (typeof PRODUCTS)[number]
type Cart = Record<string, number>

function ProductRow({ product, cart }: { product: Product; cart: State<Cart> }) {
  const qty = derived(() => cart.get(product.id) ?? 0)
  const change = (by: number) =>
    cart.set((d) => {
      d[product.id] = Math.max(0, (d[product.id] ?? 0) + by)
    })
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
      <Button size="sm" emphasis="outline" disabled={qty.value === 0} onClick={() => change(-1)}>
        −
      </Button>
      <strong> {qty.value} </strong>
      <Button size="sm" emphasis="outline" onClick={() => change(1)}>
        +
      </Button>
    </p>
  )
}

function Checkout({
  email,
  items,
  receipt,
  checkout,
}: {
  email: State<string>
  items: State<number>
  receipt: State<{ email: string; total: number } | null>
  checkout: (e: SubmitEvent) => void
}) {
  return (
    <>
      <form onSubmit={checkout}>
        <Input
          label="Email for the receipt"
          type="email"
          required
          value={email.value}
          onInput={(e) => (email.value = e.currentTarget.value)}
        />
        <Button type="submit" disabled={items.value === 0}>
          Place order
        </Button>
      </form>
      {receipt.value && (
        <p>
          Thanks! ${receipt.value.total} paid. The receipt goes to {receipt.value.email}.
        </p>
      )}
    </>
  )
}

export default function Shop() {
  const cart = state<Cart>({})
  const search = state('')
  const email = state('')
  const receipt = state<{ email: string; total: number } | null>(null)
  const shown = derived(() => {
    const word = search.value.trim().toLowerCase()
    return PRODUCTS.filter((p) => p.name.toLowerCase().includes(word))
  })
  const items = derived(() => PRODUCTS.reduce((n, p) => n + (cart.get(p.id) ?? 0), 0))
  const subtotal = derived(() =>
    PRODUCTS.reduce((sum, p) => sum + (cart.get(p.id) ?? 0) * p.price, 0),
  )
  const shipping = derived(() => (subtotal.value === 0 || subtotal.value >= 40 ? 0 : 4))
  const total = derived(() => subtotal.value + shipping.value)
  const checkout = (e: SubmitEvent) => {
    e.preventDefault()
    receipt.value = { email: email.value, total: total.value }
    cart.value = {}
  }
  return (
    <Card title="The shop">
      <Input
        label="Search"
        value={search.value}
        onInput={(e) => (search.value = e.currentTarget.value)}
      />
      {shown.value.map((p) => (
        <ProductRow key={p.id} product={p} cart={cart} />
      ))}
      {shown.value.length === 0 && <p>Nothing matches “{search.value}”.</p>}
      <p>
        {items.value} items · subtotal ${subtotal.value} · shipping ${shipping.value}
      </p>
      <p>
        <strong>Total ${total.value}</strong>
      </p>
      <Checkout email={email} items={items} receipt={receipt} checkout={checkout} />
    </Card>
  )
}
