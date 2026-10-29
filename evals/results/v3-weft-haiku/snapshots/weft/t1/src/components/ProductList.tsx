import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

type Props = { products: Product[]; cart: Cart; onAdd: (id: string) => void }

export function ProductList({ products, cart, onAdd }: Props) {
  return (
    <ul aria-label="Products">
      {products.map(p => <ProductRow key={p.id} product={p} inCart={cart[p.id] ?? 0} onAdd={onAdd} />)}
    </ul>
  )
}
