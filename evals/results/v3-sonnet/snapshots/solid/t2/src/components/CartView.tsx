import { For, Show } from 'solid-js'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; addedPrices?: Record<string, number>; onChange: (id: string, delta: number) => void }

export function CartView(props: Props) {
  const lines = () => props.products.filter(p => props.cart[p.id]).map(p => ({ product: p, qty: props.cart[p.id] }))
  const total = () => lines().reduce((sum, l) => sum + l.product.price * l.qty, 0)
  return (
    <Show when={lines().length > 0} fallback={<p>Your cart is empty.</p>}>
      <div>
        <ul aria-label="Cart">
          <For each={lines()}>
            {line => (
              <li>
                <span data-testid="name">{line.product.name}</span>
                <button aria-label={`Decrease ${line.product.name}`} onClick={() => props.onChange(line.product.id, -1)}>-</button>
                <span data-testid="qty">{line.qty}</span>
                <button aria-label={`Increase ${line.product.name}`} disabled={line.qty >= line.product.stock} onClick={() => props.onChange(line.product.id, 1)}>+</button>
                <Show when={props.addedPrices?.[line.product.id] !== undefined && props.addedPrices![line.product.id] !== line.product.price}>
                  <span data-testid="price-change">{line.product.price > props.addedPrices![line.product.id] ? 'Price up' : 'Price down'}</span>
                </Show>
                <span data-testid="line">{money(line.product.price * line.qty)}</span>
              </li>
            )}
          </For>
        </ul>
        <p data-testid="total">Total: {money(total())}</p>
      </div>
    </Show>
  )
}
