import { derived, type State } from 'weft'
import type { Category, Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export type Filters = { search: string; category: 'all' | Category; sort: 'name' | 'price-asc' | 'price-desc' }

type Props = { products: Product[]; cart: State<Cart>; filters: Filters; onFilters: (f: Filters) => void; onAdd: (id: string) => void }

export function ProductList({ products, cart, filters, onFilters, onAdd }: Props) {
  const shown = derived(() => {
    const q = filters.search.trim().toLowerCase()
    return products
      .filter(p => (filters.category === 'all' || p.category === filters.category) && p.name.toLowerCase().includes(q))
      .sort((a, b) => (filters.sort === 'name' ? a.name.localeCompare(b.name) : filters.sort === 'price-asc' ? a.price - b.price : b.price - a.price))
  })
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch })
  return (
    <section>
      <label>Search <input value={filters.search} onInput={e => set({ search: e.currentTarget.value })} /></label>
      <label>Category <select value={filters.category} onChange={e => set({ category: e.currentTarget.value as Filters['category'] })}>
        <option value="all">All</option><option value="fruit">fruit</option><option value="bakery">bakery</option><option value="dairy">dairy</option>
      </select></label>
      <label>Sort <select value={filters.sort} onChange={e => set({ sort: e.currentTarget.value as Filters['sort'] })}>
        <option value="name">Name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
      </select></label>
      <p data-testid="product-count">{shown.value.length === 1 ? '1 product' : `${shown.value.length} products`}</p>
      <ul aria-label="Products">
        {shown.value.map(p => <ProductRow key={p.id} product={p} left={p.stock - (cart.get(p.id)?.qty ?? 0)} onAdd={onAdd} />)}
      </ul>
    </section>
  )
}
