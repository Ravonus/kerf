import type { Category } from '../api'

export type CategoryFilter = 'all' | Category
export type SortKey = 'name' | 'price-asc' | 'price-desc'

type Props = {
  query: string
  category: CategoryFilter
  sort: SortKey
  onQuery: (q: string) => void
  onCategory: (c: CategoryFilter) => void
  onSort: (s: SortKey) => void
}

export function Filters({ query, category, sort, onQuery, onCategory, onSort }: Props) {
  return (
    <div>
      <label>
        Search{' '}
        <input type="text" value={query} onChange={e => onQuery(e.target.value)} />
      </label>
      <label>
        Category{' '}
        <select value={category} onChange={e => onCategory(e.target.value as CategoryFilter)}>
          <option value="all">All</option>
          <option value="fruit">fruit</option>
          <option value="bakery">bakery</option>
          <option value="dairy">dairy</option>
        </select>
      </label>
      <label>
        Sort{' '}
        <select value={sort} onChange={e => onSort(e.target.value as SortKey)}>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </label>
    </div>
  )
}
