import { Badge, Button } from '@weft-js/warp'
import type { Product } from '../api'
import { money } from '../format'

export function ProductRow({ product, left, onAdd }: { product: Product; left: number; onAdd: (id: string) => void }) {
  return (
    <li class="row">
      <span data-testid="name" class="name">{product.name}</span>
      <span data-testid="price" data-numeric="">{money(product.price)}</span>
      {left <= 0 ? <Badge tone="critical">Out of stock</Badge> : left <= 3 ? <Badge tone="caution">Only {left} left</Badge> : null}
      <Button size="sm" aria-label={`Add ${product.name}`} disabled={left <= 0} onClick={() => onAdd(product.id)}>Add</Button>
    </li>
  )
}
