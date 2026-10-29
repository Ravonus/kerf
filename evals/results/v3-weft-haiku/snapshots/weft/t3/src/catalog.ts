import type { Category, Product } from './api'

export type CategoryFilter = Category | 'all'
export type Sort = 'name' | 'price-asc' | 'price-desc'

/** The products to show: matching the search text (case-insensitive) and category, in the chosen order. */
export function visibleProducts(products: Product[], search: string, category: CategoryFilter, sort: Sort): Product[] {
  const needle = search.toLowerCase()
  const list = products.filter(p => (category === 'all' || p.category === category) && p.name.toLowerCase().includes(needle))
  if (sort === 'price-asc') return list.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') return list.sort((a, b) => b.price - a.price)
  return list.sort((a, b) => a.name.localeCompare(b.name))
}
