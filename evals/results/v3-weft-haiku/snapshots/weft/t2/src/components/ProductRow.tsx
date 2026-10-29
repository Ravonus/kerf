import { derived } from 'weft'
import type { Product } from '../api'
import { money } from '../format'
import { canAddMore } from '../stock'

type Props = { product: Product; inCart: number; onAdd: (id: string) => void }

export function ProductRow({ product, inCart, onAdd }: Props) {
  const left = derived(() => canAddMore(product, inCart))
  return (
    <li>
      <span data-testid="name">{product.name}</span>
      <span data-testid="price">{money(product.price)}</span>
      {left.value === 0 ? (
        <span data-testid="stock">Out of stock</span>
      ) : left.value <= 3 ? (
        <span data-testid="stock">{`Only ${left.value} left`}</span>
      ) : null}
      <button aria-label={`Add ${product.name}`} disabled={left.value === 0} onClick={() => onAdd(product.id)}>Add</button>
    </li>
  )
}
