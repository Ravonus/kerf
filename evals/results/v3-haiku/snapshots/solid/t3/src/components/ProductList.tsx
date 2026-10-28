import { createMemo, For } from 'solid-js'
import type { Category, Product } from '../api'
import { ProductRow } from './ProductRow'

export type CategoryFilter = Category | 'all'
export type SortKey = 'name' | 'price-asc' | 'price-desc'

type Props = {
  products: Product[]
  remaining: (id: string) => number
  onAdd: (id: string) => void
  query: string
  onQuery: (query: string) => void
  category: CategoryFilter
  onCategory: (category: CategoryFilter) => void
  sort: SortKey
  onSort: (sort: SortKey) => void
}

export function ProductList(props: Props) {
  // Uses current prices, so sorting by price follows live updates.
  const visible = createMemo(() => {
    const q = props.query.trim().toLowerCase()
    const list = props.products.filter(
      p => (props.category === 'all' || p.category === props.category) && p.name.toLowerCase().includes(q),
    )
    const byName = (a: Product, b: Product) => a.name.localeCompare(b.name)
    if (props.sort === 'price-asc') return list.sort((a, b) => a.price - b.price || byName(a, b))
    if (props.sort === 'price-desc') return list.sort((a, b) => b.price - a.price || byName(a, b))
    return list.sort(byName)
  })
  const count = () => visible().length

  return (
    <div>
      <div>
        <input
          type="text"
          aria-label="Search"
          value={props.query}
          onInput={e => props.onQuery(e.currentTarget.value)}
        />
        <select aria-label="Category" value={props.category} onChange={e => props.onCategory(e.currentTarget.value as CategoryFilter)}>
          <option value="all">All</option>
          <option value="fruit">fruit</option>
          <option value="bakery">bakery</option>
          <option value="dairy">dairy</option>
        </select>
        <select aria-label="Sort" value={props.sort} onChange={e => props.onSort(e.currentTarget.value as SortKey)}>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>
      <p data-testid="product-count">{count() === 1 ? '1 product' : `${count()} products`}</p>
      <ul aria-label="Products">
        <For each={visible()}>{p => <ProductRow product={p} remaining={props.remaining(p.id)} onAdd={props.onAdd} />}</For>
      </ul>
    </div>
  )
}
