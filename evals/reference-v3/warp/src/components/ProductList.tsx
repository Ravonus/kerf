import { derived, type State } from '@weft-js/core'
import { Card, Search, Select } from '@weft-js/warp'
import type { Category, Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

export type Filters = { search: string; category: 'all' | Category; sort: 'name' | 'price-asc' | 'price-desc' }

type Props = { products: Product[]; cart: State<Cart>; filters: Filters; onFilters: (f: Filters) => void; onAdd: (id: string) => void }

const categories = [{ value: 'all', label: 'All' }, { value: 'fruit', label: 'fruit' }, { value: 'bakery', label: 'bakery' }, { value: 'dairy', label: 'dairy' }]
const sorts = [{ value: 'name', label: 'Name' }, { value: 'price-asc', label: 'Price: low to high' }, { value: 'price-desc', label: 'Price: high to low' }]

export function ProductList({ products, cart, filters, onFilters, onAdd }: Props) {
  const shown = derived(() => {
    const q = filters.search.trim().toLowerCase()
    return products
      .filter(p => (filters.category === 'all' || p.category === filters.category) && p.name.toLowerCase().includes(q))
      .sort((a, b) => (filters.sort === 'name' ? a.name.localeCompare(b.name) : filters.sort === 'price-asc' ? a.price - b.price : b.price - a.price))
  })
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch })
  return (
    <Card>
      <h2 data-part="title">Products</h2>
      <div class="filters">
        <Search label="Search" value={filters.search} onInput={(e: InputEvent) => set({ search: (e.currentTarget as HTMLInputElement).value })} />
        <Select label="Category" value={filters.category} options={categories} onChange={(e: Event) => set({ category: (e.currentTarget as HTMLSelectElement).value as Filters['category'] })} />
        <Select label="Sort" value={filters.sort} options={sorts} onChange={(e: Event) => set({ sort: (e.currentTarget as HTMLSelectElement).value as Filters['sort'] })} />
      </div>
      <p data-testid="product-count" class="meta">{shown.value.length === 1 ? '1 product' : `${shown.value.length} products`}</p>
      <ul aria-label="Products" class="rows">
        {shown.value.map(p => <ProductRow key={p.id} product={p} left={p.stock - (cart.get(p.id)?.qty ?? 0)} onAdd={onAdd} />)}
      </ul>
    </Card>
  )
}
