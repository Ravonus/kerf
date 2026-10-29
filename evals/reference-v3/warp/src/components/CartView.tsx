import { derived } from 'weft'
import { Badge, Button, Card } from '@weft/warp'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView({ products, cart, onChange }: Props) {
  const lines = derived(() => products.filter(p => cart[p.id]))
  const total = derived(() => lines.value.reduce((sum, p) => sum + p.price * cart[p.id].qty, 0))
  return (
    <Card>
      <h2 data-part="title">Cart</h2>
      {lines.value.length > 0 ? (
        <div>
          <ul aria-label="Cart" class="rows">
            {lines.value.map(p => (
              <li key={p.id} class="row">
                <span data-testid="name" class="name">{p.name}</span>
                <Button size="sm" emphasis="outline" tone="neutral" aria-label={`Decrease ${p.name}`} onClick={() => onChange(p.id, -1)}>-</Button>
                <span data-testid="qty" data-numeric="">{cart[p.id].qty}</span>
                <Button size="sm" emphasis="outline" tone="neutral" aria-label={`Increase ${p.name}`} disabled={cart[p.id].qty >= p.stock} onClick={() => onChange(p.id, 1)}>+</Button>
                <span data-testid="line" data-numeric="">{money(p.price * cart[p.id].qty)}</span>
                {p.price !== cart[p.id].addedPrice && (
                  <Badge data-testid="price-change" tone={p.price > cart[p.id].addedPrice ? 'caution' : 'positive'}>{p.price > cart[p.id].addedPrice ? 'Price up' : 'Price down'}</Badge>
                )}
              </li>
            ))}
          </ul>
          <p data-testid="total" class="total" data-numeric="">Total: {money(total.value)}</p>
        </div>
      ) : (
        <p class="meta">Your cart is empty.</p>
      )}
    </Card>
  )
}
