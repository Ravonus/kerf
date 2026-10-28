import { For } from 'solid-js'
import type { Product } from '../api'
import { ProductRow } from './ProductRow'

export function ProductList(props: { products: Product[]; onAdd: (id: string) => void }) {
  return (
    <ul aria-label="Products">
      <For each={props.products}>{p => <ProductRow product={p} onAdd={props.onAdd} />}</For>
    </ul>
  )
}
