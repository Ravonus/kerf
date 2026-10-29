import { derived } from 'weft'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView({ products, cart, onChange }: Props) {
  const lines = derived(() => products.filter(p => cart[p.id]))
  const total = derived(() => lines.value.reduce((sum, p) => sum + p.price * cart[p.id].qty, 0))
  return (
    <>
      {lines.value.length > 0 ? (
        <div class="cart">
          <ul class="cart__list" aria-label="Cart">
            {lines.value.map(p => (
              <li key={p.id} class="cart-line">
                <span class="cart-line__name" data-testid="name">{p.name}</span>
                <button class="button button--ghost" aria-label={`Decrease ${p.name}`} onClick={() => onChange(p.id, -1)}>-</button>
                <span class="cart-line__qty" data-testid="qty">{cart[p.id].qty}</span>
                <button class="button button--ghost" aria-label={`Increase ${p.name}`} disabled={cart[p.id].qty >= p.stock} onClick={() => onChange(p.id, 1)}>+</button>
                <span class="cart-line__line" data-testid="line">{money(p.price * cart[p.id].qty)}</span>
                {p.price !== cart[p.id].addedPrice && (
                  <span class={p.price > cart[p.id].addedPrice ? 'cart-line__change cart-line__change--up' : 'cart-line__change cart-line__change--down'} data-testid="price-change">{p.price > cart[p.id].addedPrice ? 'Price up' : 'Price down'}</span>
                )}
              </li>
            ))}
          </ul>
          <p class="cart__total" data-testid="total">Total: {money(total.value)}</p>
        </div>
      ) : (
        <p class="cart__empty">Your cart is empty.</p>
      )}
    </>
  )
}
