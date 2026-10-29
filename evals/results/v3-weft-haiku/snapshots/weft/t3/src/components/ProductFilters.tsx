import type { State } from 'weft'
import type { CategoryFilter, Sort } from '../catalog'

type Props = { search: State<string>; category: State<CategoryFilter>; sort: State<Sort> }

export function ProductFilters({ search, category, sort }: Props) {
  return (
    <div>
      <label>
        Search
        <input value={search.value} onInput={e => (search.value = e.currentTarget.value)} />
      </label>
      <label>
        Category
        <select value={category.value} onChange={e => (category.value = e.currentTarget.value as CategoryFilter)}>
          <option value="all">All</option>
          <option value="fruit">fruit</option>
          <option value="bakery">bakery</option>
          <option value="dairy">dairy</option>
        </select>
      </label>
      <label>
        Sort
        <select value={sort.value} onChange={e => (sort.value = e.currentTarget.value as Sort)}>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
    </div>
  )
}
