import { useEffect, useState } from 'react'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Header } from './components/Header'
import { ProductList, type Filters } from './components/ProductList'

export type CartLine = { qty: number; addedPrice: number }
export type Cart = Record<string, CartLine>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [tab, setTab] = useState<Tab>('products')
  const [filters, setFilters] = useState<Filters>({ search: '', category: 'all', sort: 'name' })

  useEffect(() => {
    let cancelled = false
    api.listProducts().then((list) => {
      if (!cancelled) setProducts(list)
    })
    const unsubscribe = api.subscribePrices(({ id, price }) =>
      setProducts((list) => list && list.map((p) => (p.id === id ? { ...p, price } : p))),
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api])

  const byId = (id: string) => products?.find((p) => p.id === id)
  const change = (id: string, delta: number) =>
    setCart((c) => {
      const product = byId(id)
      if (!product) return c
      const qty = (c[id]?.qty ?? 0) + delta
      const { [id]: _, ...rest } = c
      if (qty <= 0) return rest
      if (qty > product.stock) return c
      return { ...rest, [id]: { qty, addedPrice: c[id]?.addedPrice ?? product.price } }
    })

  const count = Object.values(cart).reduce((a, l) => a + l.qty, 0)

  return (
    <div>
      <Header tab={tab} count={count} onTab={setTab} />
      {!products ? (
        <p>Loading…</p>
      ) : tab === 'products' ? (
        <ProductList
          products={products}
          cart={cart}
          filters={filters}
          onFilters={setFilters}
          onAdd={(id) => change(id, 1)}
        />
      ) : (
        <CartView products={products} cart={cart} onChange={change} />
      )}
    </div>
  )
}
