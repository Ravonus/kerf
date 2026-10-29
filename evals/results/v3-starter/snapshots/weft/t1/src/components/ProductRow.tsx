import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, onAdd }: { product: Product; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      <button aria-label={`Add ${product.name}`} onClick={() => onAdd(product.id)}>Add</button>
    </li>
  )
}
