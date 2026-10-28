import { createMemo, For } from 'solid-js'
import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

type Props = {
  products: Product[]
  cart: Cart
  onAdd: (id: string) => void
  search: string
  onSearch: (v: string) => void
  category: string
  onCategory: (v: string) => void
  sort: string
  onSort: (v: string) => void
}

export function ProductList(props: Props) {
  const shown = createMemo(() => {
    const q = props.search.trim().toLowerCase()
    const list = props.products.filter(
      p => (props.category === 'all' || p.category === props.category) && p.name.toLowerCase().includes(q),
    )
    return list.sort((a, b) =>
      props.sort === 'price-asc' ? a.price - b.price || a.name.localeCompare(b.name)
      : props.sort === 'price-desc' ? b.price - a.price || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
    )
  })
  return (
    <div>
      <label>
        Search
        <input type="text" value={props.search} onInput={e => props.onSearch(e.currentTarget.value)} />
      </label>
      <label>
        Category
        <select value={props.category} onChange={e => props.onCategory(e.currentTarget.value)}>
          <option value="all">All</option>
          <option value="fruit">fruit</option>
          <option value="bakery">bakery</option>
          <option value="dairy">dairy</option>
        </select>
      </label>
      <label>
        Sort
        <select value={props.sort} onChange={e => props.onSort(e.currentTarget.value)}>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
      <p data-testid="product-count">{shown().length === 1 ? '1 product' : `${shown().length} products`}</p>
      <ul aria-label="Products">
        <For each={shown()}>{p => <ProductRow product={p} inCart={props.cart[p.id] ?? 0} onAdd={props.onAdd} />}</For>
      </ul>
    </div>
  )
}
