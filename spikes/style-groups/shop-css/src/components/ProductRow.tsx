import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({
  product,
  left,
  onAdd,
}: {
  product: Product
  left: number
  onAdd: (id: string) => void
}) {
  return (
    <li class={left <= 0 ? 'product-row product-row--out' : 'product-row'}>
      <span class="product-row__name" data-testid="name">
        {product.name}
      </span>
      <span class="product-row__price" data-testid="price">
        {money(product.price)}
      </span>
      {left <= 0 ? (
        <span class="product-row__note product-row__note--out">Out of stock</span>
      ) : left <= 3 ? (
        <span class="product-row__note product-row__note--low">Only {left} left</span>
      ) : null}
      <button
        class="button"
        aria-label={`Add ${product.name}`}
        disabled={left <= 0}
        onClick={() => onAdd(product.id)}
      >
        Add
      </button>
    </li>
  )
}
