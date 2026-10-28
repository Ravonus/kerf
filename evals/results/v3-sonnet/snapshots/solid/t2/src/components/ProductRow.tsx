import { Show } from 'solid-js'
import type { Product } from '../api'
import { money } from '../format'

export function ProductRow(props: { product: Product; inCart: number; onAdd: (id: string) => void }) {
  const left = () => Math.max(0, props.product.stock - props.inCart)
  return (
    <li>
      <span data-testid="name">{props.product.name}</span>
      <span data-testid="price">{money(props.product.price)}</span>
      <Show when={left() === 0}>
        <span>Out of stock</span>
      </Show>
      <Show when={left() > 0 && left() <= 3}>
        <span>Only {left()} left</span>
      </Show>
      <button aria-label={`Add ${props.product.name}`} disabled={left() === 0} onClick={() => props.onAdd(props.product.id)}>Add</button>
    </li>
  )
}
