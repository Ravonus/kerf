import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView({ products, cart, onChange }: Props) {
  const lines = products.filter(p => cart[p.id]).map(p => ({ product: p, ...cart[p.id] }))
  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  if (lines.length === 0) return <p>Your cart is empty.</p>
  return (
    <div>
      <ul aria-label="Cart">
        {lines.map(({ product, qty, refPrice }) => (
          <li key={product.id}>
            <span data-testid="name">{product.name}</span>
            <button aria-label={`Decrease ${product.name}`} onClick={() => onChange(product.id, -1)}>-</button>
            <span data-testid="qty">{qty}</span>
            <button aria-label={`Increase ${product.name}`} disabled={qty >= product.stock} onClick={() => onChange(product.id, 1)}>+</button>
            <span data-testid="line">{money(product.price * qty)}</span>
            {product.price !== refPrice && (
              <span data-testid="price-change">{product.price > refPrice ? 'Price up' : 'Price down'}</span>
            )}
          </li>
        ))}
      </ul>
      <p data-testid="total">Total: {money(total)}</p>
    </div>
  )
}
