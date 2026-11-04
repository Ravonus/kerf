import { For, Show } from 'solid-js'
import type { Product } from '../api'
import type { Cart } from '../App'
import { money } from '../format'

type Props = { products: Product[]; cart: Cart; onChange: (id: string, delta: number) => void }

export function CartView(props: Props) {
  const lines = () => props.products.filter((p) => props.cart[p.id])
  const total = () => lines().reduce((sum, p) => sum + p.price * props.cart[p.id].qty, 0)
  return (
    <Show when={lines().length > 0} fallback={<p>Your cart is empty.</p>}>
      <div>
        <ul aria-label="Cart">
          <For each={lines()}>
            {(product) => {
              const line = () => props.cart[product.id]
              return (
                <li>
                  <span data-testid="name">{product.name}</span>
                  <button
                    aria-label={`Decrease ${product.name}`}
                    onClick={() => props.onChange(product.id, -1)}
                  >
                    -
                  </button>
                  <span data-testid="qty">{line().qty}</span>
                  <button
                    aria-label={`Increase ${product.name}`}
                    disabled={line().qty >= product.stock}
                    onClick={() => props.onChange(product.id, 1)}
                  >
                    +
                  </button>
                  <span data-testid="line">{money(product.price * line().qty)}</span>
                  <Show when={product.price !== line().addedPrice}>
                    <span data-testid="price-change">
                      {product.price > line().addedPrice ? 'Price up' : 'Price down'}
                    </span>
                  </Show>
                </li>
              )
            }}
          </For>
        </ul>
        <p data-testid="total">Total: {money(total())}</p>
      </div>
    </Show>
  )
}
