import { createSignal, Match, onCleanup, Switch } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList, type Filters } from './components/ProductList'

export type CartLine = { qty: number; addedPrice: number }
export type Cart = Record<string, CartLine>
type Tab = 'products' | 'cart'

export function App(props: { api: Api }) {
  const [state, setState] = createStore<{ products: Product[] | null }>({ products: null })
  const [cart, setCart] = createSignal<Cart>({})
  const [tab, setTab] = createSignal<Tab>('products')
  const [filters, setFilters] = createSignal<Filters>({ search: '', category: 'all', sort: 'name' })

  let cancelled = false
  props.api.listProducts().then(list => { if (!cancelled) setState('products', reconcile(list)) })
  const unsubscribe = props.api.subscribePrices(({ id, price }) => {
    if (state.products) setState('products', p => p.id === id, 'price', price)
  })
  onCleanup(() => { cancelled = true; unsubscribe() })

  const change = (id: string, delta: number) =>
    setCart(c => {
      const product = state.products?.find(p => p.id === id)
      if (!product) return c
      const qty = (c[id]?.qty ?? 0) + delta
      const { [id]: _, ...rest } = c
      if (qty <= 0) return rest
      if (qty > product.stock) return c
      return { ...rest, [id]: { qty, addedPrice: c[id]?.addedPrice ?? product.price } }
    })

  const count = () => Object.values(cart()).reduce((a, l) => a + l.qty, 0)

  return (
    <div>
      <Header tab={tab()} count={count()} onTab={setTab} />
      <Switch>
        <Match when={!state.products}><p>Loading…</p></Match>
        <Match when={tab() === 'products'}>
          <ProductList products={state.products!} cart={cart()} filters={filters()} onFilters={setFilters} onAdd={id => change(id, 1)} />
        </Match>
        <Match when={tab() === 'cart'}><CartView products={state.products!} cart={cart()} onChange={change} /></Match>
      </Switch>
    </div>
  )
}
