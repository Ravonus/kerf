import { createEffect, createResource, createSignal, Match, onCleanup, Switch } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'

/** price is the unit price when the product was first put in the cart. */
export type CartLine = { qty: number; price: number }
export type Cart = Record<string, CartLine>
type Tab = 'products' | 'cart'

export function App(props: { api: Api }) {
  const [products] = createResource(async () => {
    const list = await props.api.listProducts()
    setCatalog(list)
    return list
  })
  // The catalog is a store so live price updates reach rows and cart lines without rebuilding them.
  const [catalog, setCatalog] = createStore<Product[]>([])
  const [cart, setCart] = createSignal<Cart>({})
  const [tab, setTab] = createSignal<Tab>('products')

  createEffect(() => {
    if (!products()) return
    const unsubscribe = props.api.subscribePrices(({ id, price }) => {
      const i = catalog.findIndex(p => p.id === id)
      if (i >= 0) setCatalog(i, 'price', price)
    })
    onCleanup(unsubscribe)
  })

  // How many more of a product can still be added to the cart without exceeding stock.
  const remaining = (id: string) => {
    const product = catalog.find(p => p.id === id)
    return Math.max(0, (product?.stock ?? 0) - (cart()[id]?.qty ?? 0))
  }

  const add = (id: string) => {
    if (remaining(id) <= 0) return
    const product = catalog.find(p => p.id === id)!
    setCart(c => {
      const line = c[id]
      return { ...c, [id]: { qty: (line?.qty ?? 0) + 1, price: line?.price ?? product.price } }
    })
  }
  const change = (id: string, delta: number) => {
    if (delta > 0 && remaining(id) <= 0) return
    setCart(c => {
      const line = c[id]
      if (!line) return c
      const qty = line.qty + delta
      const { [id]: _, ...rest } = c
      return qty > 0 ? { ...rest, [id]: { ...line, qty } } : rest
    })
  }

  const count = () => Object.values(cart()).reduce((a, line) => a + line.qty, 0)

  return (
    <div>
      <Header tab={tab()} count={count()} onTab={setTab} />
      <Switch>
        <Match when={!products()}><p>Loading…</p></Match>
        <Match when={tab() === 'products'}><ProductList products={catalog} remaining={remaining} onAdd={add} /></Match>
        <Match when={tab() === 'cart'}><CartView products={catalog} cart={cart()} onChange={change} /></Match>
      </Switch>
    </div>
  )
}
