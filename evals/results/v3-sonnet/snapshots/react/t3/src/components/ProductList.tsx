import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export type Filters = { search: string; category: 'all' | Product['category']; sort: 'name' | 'price-asc' | 'price-desc' }

type Props = {
  products: Product[]
  cart: Cart
  filters: Filters
  onFilters: (f: Filters) => void
  onAdd: (id: string) => void
}

export function ProductList({ products, cart, filters, onFilters, onAdd }: Props) {
  const q = filters.search.trim().toLowerCase()
  const shown = products
    .filter(p => p.name.toLowerCase().includes(q) && (filters.category === 'all' || p.category === filters.category))
    .sort((a, b) =>
      filters.sort === 'price-asc' ? a.price - b.price || a.name.localeCompare(b.name)
      : filters.sort === 'price-desc' ? b.price - a.price || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name))
  return (
    <div>
      <label>
        Search
        <input type="text" value={filters.search} onChange={e => onFilters({ ...filters, search: e.target.value })} />
      </label>
      <label>
        Category
        <select value={filters.category} onChange={e => onFilters({ ...filters, category: e.target.value as Filters['category'] })}>
          <option value="all">All</option>
          <option value="fruit">fruit</option>
          <option value="bakery">bakery</option>
          <option value="dairy">dairy</option>
        </select>
      </label>
      <label>
        Sort
        <select value={filters.sort} onChange={e => onFilters({ ...filters, sort: e.target.value as Filters['sort'] })}>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
      <p data-testid="product-count">{shown.length === 1 ? '1 product' : `${shown.length} products`}</p>
      <ul aria-label="Products">
        {shown.map(p => <ProductRow key={p.id} product={p} inCart={cart[p.id] ?? 0} onAdd={onAdd} />)}
      </ul>
    </div>
  )
}
