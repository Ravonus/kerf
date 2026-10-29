import { derived, state, watch } from 'weft'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'
import { canAddMore } from './stock'

export type Cart = Record<string, number>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const products = state<Product[] | null>(null)
  const cart = state<Cart>({})
  // Price of each cart line when its product was first added (the price the shopper saw).
  const paid = state<Record<string, number>>({})
  const tab = state<Tab>('products')

  watch(() => api, source => {
    let live = true
    let latest: Record<string, number> = {}
    source.listProducts().then(list => {
      if (live) products.value = list.map(p => (p.id in latest ? { ...p, price: latest[p.id] } : p))
    })
    const unsubscribe = source.subscribePrices(({ id, price }) => {
      if (!live) return
      latest = { ...latest, [id]: price }
      if (products.value) products.value = products.value.map(p => (p.id === id ? { ...p, price } : p))
    })
    return () => {
      live = false
      unsubscribe()
    }
  })

  const productOf = (id: string) => products.value?.find(p => p.id === id)
  const add = (id: string) => {
    const product = productOf(id)
    if (!product || canAddMore(product, cart.value[id] ?? 0) === 0) return
    if (!cart.value[id]) paid.value = { ...paid.value, [id]: product.price }
    cart.value = { ...cart.value, [id]: (cart.value[id] ?? 0) + 1 }
  }
  const change = (id: string, delta: number) => {
    const product = productOf(id)
    if (delta > 0 && (!product || canAddMore(product, cart.value[id] ?? 0) === 0)) return
    const next = (cart.value[id] ?? 0) + delta
    const { [id]: _, ...rest } = cart.value
    cart.value = next > 0 ? { ...rest, [id]: next } : rest
    if (next <= 0) {
      const { [id]: __, ...prices } = paid.value
      paid.value = prices
    }
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
        <CartView products={products.value} cart={cart.value} paid={paid.value} onChange={change} />
      )}
    </div>
  )
}
