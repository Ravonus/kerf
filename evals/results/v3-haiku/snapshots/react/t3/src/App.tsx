import { useEffect, useState } from 'react'
import type { Api, Product } from './api'
import { CartView } from './components/CartView'
import { Filters, type CategoryFilter, type SortKey } from './components/Filters'
import { Header } from './components/Header'
import { ProductList } from './components/ProductList'

// refPrice is the price when the product was put in the cart (its first add).
export type CartLine = { qty: number; refPrice: number }
export type Cart = Record<string, CartLine>
type Tab = 'products' | 'cart'

export function App({ api }: { api: Api }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [tab, setTab] = useState<Tab>('products')
  // Kept in App (not in the Products view) so they survive switching to the Cart tab.
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sort, setSort] = useState<SortKey>('name')

  useEffect(() => {
    let cancelled = false
    api.listProducts().then(list => { if (!cancelled) setProducts(list) })
    return () => { cancelled = true }
  }, [api])

  useEffect(() =>
    api.subscribePrices(({ id, price }) =>
      setProducts(prev => prev && prev.map(p => (p.id === id ? { ...p, price } : p))),
    ), [api])

  const find = (id: string) => products?.find(p => p.id === id)

  // Quantities are capped at stock here, so every entry point (list or cart) is enforced.
  const add = (id: string) =>
    setCart(c => {
      const line = c[id]
      const have = line?.qty ?? 0
      const product = find(id)
      if (!product || have >= product.stock) return c
      return { ...c, [id]: { qty: have + 1, refPrice: line?.refPrice ?? product.price } }
    })
  const change = (id: string, delta: number) =>
    setCart(c => {
      const line = c[id]
      const have = line?.qty ?? 0
      const product = find(id)
      const next = delta > 0 ? Math.min(have + delta, product?.stock ?? 0) : have + delta
      const { [id]: _, ...rest } = c
      return next > 0 ? { ...rest, [id]: { qty: next, refPrice: line?.refPrice ?? product?.price ?? 0 } } : rest
    })

  const shown = (products ?? [])
    .filter(p => category === 'all' || p.category === category)
    .filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'price-asc' ? a.price - b.price
      : sort === 'price-desc' ? b.price - a.price
      : a.name.localeCompare(b.name))

  const count = Object.values(cart).reduce((a, l) => a + l.qty, 0)

  return (
    <div>
      <Header tab={tab} count={count} onTab={setTab} />
      {!products ? (
        <p>Loading…</p>
      ) : tab === 'products' ? (
        <>
          <Filters query={query} category={category} sort={sort}
            onQuery={setQuery} onCategory={setCategory} onSort={setSort} />
          <p data-testid="product-count">{shown.length} {shown.length === 1 ? 'product' : 'products'}</p>
          <ProductList products={shown} cart={cart} onAdd={add} />
        </>
      ) : (
        <CartView products={products} cart={cart} onChange={change} />
      )}
    </div>
  )
}
