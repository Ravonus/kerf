import { derived } from 'weft'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView({ products, cart, onChange }: Props) {
  const lines = derived(() => products.filter(p => cart[p.id]))
  const total = derived(() => lines.value.reduce((sum, p) => sum + p.price * cart[p.id], 0))
  return (
    <>
      {lines.value.length > 0 ? (
        <div>
          <ul aria-label="Cart">
            {lines.value.map(p => (
              <li key={p.id}>
                <span data-testid="name">{p.name}</span>
                <button aria-label={`Decrease ${p.name}`} onClick={() => onChange(p.id, -1)}>-</button>
                <span data-testid="qty">{cart[p.id]}</span>
                <button aria-label={`Increase ${p.name}`} disabled={cart[p.id] >= p.stock} onClick={() => onChange(p.id, 1)}>+</button>
                <span data-testid="line">{money(p.price * cart[p.id])}</span>
              </li>
            ))}
          </ul>
          <p data-testid="total">Total: {money(total.value)}</p>
        </div>
      ) : (
        <p>Your cart is empty.</p>
      )}
    </>
  )
}
