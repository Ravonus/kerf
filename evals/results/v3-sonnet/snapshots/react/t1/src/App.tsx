import { useEffect, useState } from 'react'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'

export type Cart = Record<string, number>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [tab, setTab] = useState<Tab>('products')

  useEffect(() => {
    let cancelled = false
    api.listProducts().then(list => { if (!cancelled) setProducts(list) })
    return () => { cancelled = true }
  }, [api])

  const stockOf = (id: string) => products?.find(p => p.id === id)?.stock ?? 0
  const add = (id: string) =>
    setCart(c => ((c[id] ?? 0) + 1 > stockOf(id) ? c : { ...c, [id]: (c[id] ?? 0) + 1 }))
  const change = (id: string, delta: number) =>
    setCart(c => {
      const next = Math.min((c[id] ?? 0) + delta, stockOf(id))
      const { [id]: _, ...rest } = c
      return next > 0 ? { ...rest, [id]: next } : rest
    })

  const count = Object.values(cart).reduce((a, b) => a + b, 0)

  return (
    <div>
      <Header tab={tab} count={count} onTab={setTab} />
      {!products ? (
        <p>Loading…</p>
      ) : tab === 'products' ? (
        <ProductList products={products} cart={cart} onAdd={add} />
      ) : (
        <CartView products={products} cart={cart} onChange={change} />
      )}
    </div>
  )
}
