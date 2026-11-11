import { derived } from '@kerf-js/core'
import type { Product } from '../api'
import { cart } from '../state/cart'
import { money } from '../format'

type Props = { products: Product[] }

export function CartView({ products }: Props) {
  const lines = derived(() => products.filter((p) => cart.line(p.id)))
  const total = derived(() =>
    lines.value.reduce((sum, p) => sum + p.price * cart.line(p.id)!.qty, 0),
  )
  return (
    <>
      {lines.value.length > 0 ? (
        <div>
          <ul aria-label="Cart">
            {lines.value.map((p) => (
              <li key={p.id}>
                <span data-testid="name">{p.name}</span>
                <button aria-label={`Decrease ${p.name}`} onClick={() => cart.change(p, -1)}>
                  -
                </button>
                <span data-testid="qty">{cart.line(p.id)!.qty}</span>
                <button
                  aria-label={`Increase ${p.name}`}
                  disabled={cart.line(p.id)!.qty >= p.stock}
                  onClick={() => cart.change(p, 1)}
                >
                  +
                </button>
                <span data-testid="line">{money(p.price * cart.line(p.id)!.qty)}</span>
                {p.price !== cart.line(p.id)!.addedPrice && (
                  <span data-testid="price-change">
                    {p.price > cart.line(p.id)!.addedPrice ? 'Price up' : 'Price down'}
                  </span>
                )}
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
