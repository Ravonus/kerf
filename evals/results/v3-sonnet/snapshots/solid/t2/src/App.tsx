import { createMemo, createResource, createSignal, Match, onCleanup, Switch } from 'solid-js'
import type { Api } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'

export type Cart = Record<string, number>
type Tab = 'products' | 'cart'

export function App(props: { api: Api }) {
  const [products] = createResource(() => props.api.listProducts())
  const [cart, setCart] = createSignal<Cart>({})
  const [tab, setTab] = createSignal<Tab>('products')

  const [prices, setPrices] = createSignal<Record<string, number>>({})
  const [addedPrices, setAddedPrices] = createSignal<Record<string, number>>({})
  const unsubscribe = props.api.subscribePrices?.(u => setPrices(p => ({ ...p, [u.id]: u.price })))
  onCleanup(() => unsubscribe?.())
  const live = createMemo(() => products()?.map(p => ({ ...p, price: prices()[p.id] ?? p.price })))

  const stockOf = (id: string) => products()?.find(p => p.id === id)?.stock ?? 0
  const setQty = (id: string, qty: number) => {
    const prod = live()?.find(p => p.id === id)
    if (!prod) return
    qty = Math.min(qty, prod.stock)
    const current = cart()[id] ?? 0
    if (qty === current) return
    if (current === 0) setAddedPrices(a => ({ ...a, [id]: prod.price }))
    if (qty <= 0) {
      setAddedPrices(a => { const { [id]: _, ...rest } = a; return rest })
      setCart(c => { const { [id]: _, ...rest } = c; return rest })
    } else setCart(c => ({ ...c, [id]: qty }))
  }
  const add = (id: string) => setQty(id, (cart()[id] ?? 0) + 1)
  const change = (id: string, delta: number) => setQty(id, (cart()[id] ?? 0) + delta)

  const count = () => Object.values(cart()).reduce((a, b) => a + b, 0)

  return (
    <div>
      <Header tab={tab()} count={count()} onTab={setTab} />
      <Switch>
        <Match when={!products()}><p>Loading…</p></Match>
        <Match when={tab() === 'products'}><ProductList products={live()!} cart={cart()} onAdd={add} /></Match>
        <Match when={tab() === 'cart'}><CartView products={live()!} cart={cart()} addedPrices={addedPrices()} onChange={change} /></Match>
      </Switch>
    </div>
  )
}
