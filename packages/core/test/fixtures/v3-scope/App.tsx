import { state, watch } from '@weft-js/core'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList, type Filters } from './components/ProductList'
import { cart } from './state/cart'

type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const products = state<Product[] | null>(null)
  const tab = state<Tab>('products')
  const filters = state<Filters>({ search: '', category: 'all', sort: 'name' })

  watch(
    () => api,
    (source) => {
      let live = true
      source.listProducts().then((list) => {
        if (live) products.value = list
      })
      const unsubscribe = source.subscribePrices(({ id, price }) => {
        if (products.value)
          products.value = products.value.map((p) => (p.id === id ? { ...p, price } : p))
      })
      return () => {
        live = false
        unsubscribe()
      }
    },
  )

  return (
    <div>
      <Header tab={tab.value} count={cart.count.value} onTab={(t) => (tab.value = t)} />
      {!products.value ? (
        <p>Loading…</p>
      ) : tab.value === 'products' ? (
        <ProductList
          products={products.value}
          filters={filters.value}
          onFilters={(f) => (filters.value = f)}
        />
      ) : (
        <CartView products={products.value} />
      )}
    </div>
  )
}
