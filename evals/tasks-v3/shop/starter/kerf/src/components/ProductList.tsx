import type { Product } from '../api'
import { ProductRow } from './ProductRow'

export function ProductList({
  products,
  onAdd,
}: {
  products: Product[]
  onAdd: (id: string) => void
}) {
  return (
    <ul aria-label="Products">
      {products.map((p) => (
        <ProductRow key={p.id} product={p} onAdd={onAdd} />
      ))}
    </ul>
  )
}
