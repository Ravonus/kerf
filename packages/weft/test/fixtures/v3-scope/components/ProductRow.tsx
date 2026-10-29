import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, left, onAdd }: { product: Product; left: number; onAdd: () => void }) {
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      {left <= 0 ? <span>Out of stock</span> : left <= 3 ? <span>Only {left} left</span> : null}
      <button aria-label={`Add ${product.name}`} disabled={left <= 0} onClick={onAdd}>Add</button>
    </li>
  )
}
