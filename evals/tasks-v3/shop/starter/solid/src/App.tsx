import { createResource, createSignal, Match, Switch } from 'solid-js'
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

  const add = (id: string) => setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }))
  const change = (id: string, delta: number) =>
    setCart(c => {
      const next = (c[id] ?? 0) + delta
      const { [id]: _, ...rest } = c
      return next > 0 ? { ...rest, [id]: next } : rest
    })

  const count = () => Object.values(cart()).reduce((a, b) => a + b, 0)

  return (
    <div>
      <Header tab={tab()} count={count()} onTab={setTab} />
      <Switch>
        <Match when={!products()}><p>Loading…</p></Match>
        <Match when={tab() === 'products'}><ProductList products={products()!} onAdd={add} /></Match>
        <Match when={tab() === 'cart'}><CartView products={products()!} cart={cart()} onChange={change} /></Match>
      </Switch>
    </div>
  )
}
