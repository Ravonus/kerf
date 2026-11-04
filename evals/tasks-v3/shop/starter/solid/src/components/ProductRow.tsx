import type { Product } from '../api'
import { money } from '../format'

export function ProductRow(props: { product: Product; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{props.product.name}</span>
      <span data-testid="price">{money(props.product.price)}</span>
      <button
        aria-label={`Add ${props.product.name}`}
        onClick={() => props.onAdd(props.product.id)}
      >
        Add
      </button>
    </li>
  )
}
