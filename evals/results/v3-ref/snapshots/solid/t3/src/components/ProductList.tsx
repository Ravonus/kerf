import { For } from 'solid-js'
import type { Category, Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export type Filters = { search: string; category: 'all' | Category; sort: 'name' | 'price-asc' | 'price-desc' }

type Props = { products: Product[]; cart: Cart; filters: Filters; onFilters: (f: Filters) => void; onAdd: (id: string) => void }

export function ProductList(props: Props) {
  const shown = () => {
    const f = props.filters
    const q = f.search.trim().toLowerCase()
    return props.products
      .filter(p => (f.category === 'all' || p.category === f.category) && p.name.toLowerCase().includes(q))
      .sort((a, b) => (f.sort === 'name' ? a.name.localeCompare(b.name) : f.sort === 'price-asc' ? a.price - b.price : b.price - a.price))
  }
  const set = (patch: Partial<Filters>) => props.onFilters({ ...props.filters, ...patch })
  return (
    <section>
      <label>Search <input value={props.filters.search} onInput={e => set({ search: e.currentTarget.value })} /></label>
      <label>Category <select value={props.filters.category} onChange={e => set({ category: e.currentTarget.value as Filters['category'] })}>
        <option value="all">All</option><option value="fruit">fruit</option><option value="bakery">bakery</option><option value="dairy">dairy</option>
      </select></label>
      <label>Sort <select value={props.filters.sort} onChange={e => set({ sort: e.currentTarget.value as Filters['sort'] })}>
        <option value="name">Name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
      </select></label>
      <p data-testid="product-count">{shown().length === 1 ? '1 product' : `${shown().length} products`}</p>
      <ul aria-label="Products">
        <For each={shown()}>{p => <ProductRow product={p} left={p.stock - (props.cart[p.id]?.qty ?? 0)} onAdd={props.onAdd} />}</For>
      </ul>
    </section>
  )
}
