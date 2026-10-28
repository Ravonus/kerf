import { Show } from 'solid-js'
import type { Product } from '../api'
import { money } from '../format'

export function ProductRow(props: { product: Product; remaining: number; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{props.product.name}</span>
      <span data-testid="price">{money(props.product.price)}</span>
      <Show when={props.remaining > 0} fallback={<span data-testid="stock">Out of stock</span>}>
        <Show when={props.remaining <= 3}>
          <span data-testid="stock">Only {props.remaining} left</span>
        </Show>
      </Show>
      <button
        aria-label={`Add ${props.product.name}`}
        disabled={props.remaining <= 0}
        onClick={() => props.onAdd(props.product.id)}
      >
        Add
      </button>
    </li>
  )
}
