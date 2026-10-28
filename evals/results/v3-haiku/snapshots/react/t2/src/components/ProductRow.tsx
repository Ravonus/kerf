import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, remaining, onAdd }: { product: Product; remaining: number; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      {remaining === 0 ? (
        <span data-testid="stock">Out of stock</span>
      ) : remaining <= 3 ? (
        <span data-testid="stock">Only {remaining} left</span>
      ) : null}
      <button aria-label={`Add ${product.name}`} disabled={remaining === 0} onClick={() => onAdd(product.id)}>Add</button>
    </li>
  )
}
