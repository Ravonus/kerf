import { For, Show } from 'solid-js'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView(props: Props) {
  // Lines are keyed on the stable product objects so rows (and their buttons) are not rebuilt on every change.
  const lines = () => props.products.filter(p => props.cart[p.id])
  const total = () => lines().reduce((sum, p) => sum + p.price * props.cart[p.id], 0)
  return (
    <Show when={lines().length > 0} fallback={<p>Your cart is empty.</p>}>
      <div>
        <ul aria-label="Cart">
          <For each={lines()}>
            {product => (
              <li>
                <span data-testid="name">{product.name}</span>
                <button aria-label={`Decrease ${product.name}`} onClick={() => props.onChange(product.id, -1)}>-</button>
                <span data-testid="qty">{props.cart[product.id]}</span>
                <button aria-label={`Increase ${product.name}`} disabled={props.cart[product.id] >= product.stock} onClick={() => props.onChange(product.id, 1)}>+</button>
                <span data-testid="line">{money(product.price * props.cart[product.id])}</span>
              </li>
            )}
          </For>
        </ul>
        <p data-testid="total">Total: {money(total())}</p>
      </div>
    </Show>
  )
}
