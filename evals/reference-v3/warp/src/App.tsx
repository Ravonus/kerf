import { derived, state, watch } from 'weft'
import { Skeleton } from '@weft/warp'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList, type Filters } from './components/ProductList'
import './shop.css'

export type CartLine = { qty: number; addedPrice: number }
export type Cart = Record<string, CartLine>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const products = state<Product[] | null>(null)
  const cart = state<Cart>({})
  const tab = state<Tab>('products')
  const filters = state<Filters>({ search: '', category: 'all', sort: 'name' })

  watch(() => api, source => {
    let live = true
    source.listProducts().then(list => { if (live) products.value = list })
    const unsubscribe = source.subscribePrices(({ id, price }) => {
      if (products.value) products.value = products.value.map(p => (p.id === id ? { ...p, price } : p))
    })
    return () => { live = false; unsubscribe() }
  })

  const change = (id: string, delta: number) => {
    const product = products.value?.find(p => p.id === id)
    if (!product) return
    const { [id]: line, ...rest } = cart.value
    const qty = (line?.qty ?? 0) + delta
    if (qty > product.stock) return
    cart.value = qty <= 0 ? rest : { ...rest, [id]: { qty, addedPrice: line?.addedPrice ?? product.price } }
  }

  const count = derived(() => Object.values(cart.value).reduce((n, l) => n + l.qty, 0))

  return (
    <div class="shop">
      <Header tab={tab.value} count={count.value} onTab={t => (tab.value = t)} />
      <main>
      {!products.value ? (
        <Skeleton shape="block" lines={3} />
      ) : tab.value === 'products' ? (
        <ProductList products={products.value} cart={cart.value} filters={filters.value} onFilters={f => (filters.value = f)} onAdd={id => change(id, 1)} />
      ) : (
        <CartView products={products.value} cart={cart.value} onChange={change} />
      )}
      </main>
    </div>
  )
}
