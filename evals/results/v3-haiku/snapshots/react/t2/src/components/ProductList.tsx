import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export function ProductList({ products, cart, onAdd }: { products: Product[]; cart: Cart; onAdd: (id: string) => void }) {
  return (
    <ul aria-label="Products">
      {products.map(p => (
        <ProductRow key={p.id} product={p} remaining={Math.max(0, p.stock - (cart[p.id]?.qty ?? 0))} onAdd={onAdd} />
      ))}
    </ul>
  )
}
