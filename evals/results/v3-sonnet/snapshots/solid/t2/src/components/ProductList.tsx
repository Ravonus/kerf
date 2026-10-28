import { For } from 'solid-js'
import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export function ProductList(props: { products: Product[]; cart: Cart; onAdd: (id: string) => void }) {
  return (
    <ul aria-label="Products">
      <For each={props.products}>{p => <ProductRow product={p} inCart={props.cart[p.id] ?? 0} onAdd={props.onAdd} />}</For>
    </ul>
  )
}
