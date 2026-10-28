import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, inCart, onAdd }: { product: Product; inCart: number; onAdd: (id: string) => void }) {
  const left = Math.max(0, product.stock - inCart)
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      {left === 0 ? <span>Out of stock</span> : left <= 3 ? <span>Only {left} left</span> : null}
      <button aria-label={`Add ${product.name}`} disabled={left === 0} onClick={() => onAdd(product.id)}>Add</button>
    </li>
  )
}
