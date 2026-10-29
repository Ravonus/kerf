import { derived, state, watch } from 'weft'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'

export type Cart = Record<string, number>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const products = state<Product[] | null>(null)
  const cart = state<Cart>({})
  const tab = state<Tab>('products')

  watch(() => api, source => {
    let live = true
    source.listProducts().then(list => { if (live) products.value = list })
    return () => { live = false }
  })

  const stockOf = (id: string) => products.value?.find(p => p.id === id)?.stock ?? 0
  const add = (id: string) => {
    if ((cart.value[id] ?? 0) >= stockOf(id)) return
    cart.value = { ...cart.value, [id]: (cart.value[id] ?? 0) + 1 }
  }
  const change = (id: string, delta: number) => {
    const next = Math.min((cart.value[id] ?? 0) + delta, stockOf(id))
    const { [id]: _, ...rest } = cart.value
    cart.value = next > 0 ? { ...rest, [id]: next } : rest
  }

  const count = derived(() => Object.values(cart.value).reduce((a, b) => a + b, 0))

  return (
    <div>
      <Header tab={tab.value} count={count.value} onTab={t => (tab.value = t)} />
      {!products.value ? (
        <p>Loading…</p>
      ) : tab.value === 'products' ? (
        <ProductList products={products.value} cart={cart.value} onAdd={add} />
      ) : (
        <CartView products={products.value} cart={cart.value} onChange={change} />
      )}
    </div>
  )
}
