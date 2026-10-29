import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, inCart, onAdd }: { product: Product; inCart: number; onAdd: (id: string) => void }) {
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      {product.stock - inCart <= 0 ? (
        <span>Out of stock</span>
      ) : product.stock - inCart <= 3 ? (
        <span>Only {product.stock - inCart} left</span>
      ) : null}
      <button aria-label={`Add ${product.name}`} disabled={product.stock - inCart <= 0} onClick={() => onAdd(product.id)}>Add</button>
    </li>
  )
}
