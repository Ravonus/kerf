import type { State } from 'weft'
import { derived } from 'weft'
import type { Product } from '../api'
import type { Cart } from '../App'
import { ProductRow } from './ProductRow'

type Props = {
  products: Product[]
  cart: State<Cart>
  search: State<string>
  category: State<string>
  sort: State<string>
  onAdd: (id: string) => void
}

export function ProductList({ products, cart, search, category, sort, onAdd }: Props) {
  const shown = derived(() => {
    const q = search.value.trim().toLowerCase()
    const list = products.filter(
      p => p.name.toLowerCase().includes(q) && (category.value === 'all' || p.category === category.value),
    )
    return list.sort((a, b) =>
      sort.value === 'price-asc' ? a.price - b.price
      : sort.value === 'price-desc' ? b.price - a.price
      : a.name.localeCompare(b.name))
  })
  return (
    <>
      <div>
        <label>
          Search
          <input type="text" value={search.value} onInput={e => (search.value = e.currentTarget.value)} />
        </label>
        <label>
          Category
          <select value={category.value} onChange={e => (category.value = e.currentTarget.value)}>
            <option value="all">All</option>
            <option value="fruit">fruit</option>
            <option value="bakery">bakery</option>
            <option value="dairy">dairy</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sort.value} onChange={e => (sort.value = e.currentTarget.value)}>
            <option value="name">Name</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>
      <p data-testid="product-count">{shown.value.length === 1 ? '1 product' : `${shown.value.length} products`}</p>
      <ul aria-label="Products">
        {shown.value.map(p => <ProductRow key={p.id} product={p} inCart={cart.get(p.id) ?? 0} onAdd={onAdd} />)}
      </ul>
    </>
  )
}
