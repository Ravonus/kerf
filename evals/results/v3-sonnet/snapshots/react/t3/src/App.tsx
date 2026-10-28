import { useEffect, useMemo, useState } from 'react'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList, type Filters } from './components/ProductList'

export type Cart = Record<string, number>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const [rawProducts, setProducts] = useState<Product[] | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [baselines, setBaselines] = useState<Record<string, number>>({})
  const [cart, setCart] = useState<Cart>({})
  const products = useMemo(
    () => rawProducts && rawProducts.map(p => (p.id in prices ? { ...p, price: prices[p.id] } : p)),
    [rawProducts, prices],
  )
  const [filters, setFilters] = useState<Filters>({ search: '', category: 'all', sort: 'name' })
  const [tab, setTab] = useState<Tab>('products')

  useEffect(() => {
    let cancelled = false
    api.listProducts().then(list => { if (!cancelled) setProducts(list) })
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    const unsubscribe = api.subscribePrices?.(({ id, price }) => setPrices(p => ({ ...p, [id]: price })))
    return () => unsubscribe?.()
  }, [api])

  const stockOf = (id: string) => products?.find(p => p.id === id)?.stock ?? 0
  const noteBaseline = (id: string) => {
    if (cart[id]) return
    const price = products?.find(p => p.id === id)?.price
    if (price !== undefined) setBaselines(b => ({ ...b, [id]: price }))
  }
  const add = (id: string) => {
    noteBaseline(id)
    addToCart(id)
  }
  const addToCart = (id: string) =>
    setCart(c => ((c[id] ?? 0) + 1 > stockOf(id) ? c : { ...c, [id]: (c[id] ?? 0) + 1 }))
  const change = (id: string, delta: number) => {
    if (delta > 0) noteBaseline(id)
    else if ((cart[id] ?? 0) + delta <= 0) setBaselines(({ [id]: _, ...rest }) => rest)
    applyChange(id, delta)
  }
  const applyChange = (id: string, delta: number) =>
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
        <ProductList products={products} cart={cart} filters={filters} onFilters={setFilters} onAdd={add} />
      ) : (
        <CartView products={products} cart={cart} baselines={baselines} onChange={change} />
      )}
    </div>
  )
}
