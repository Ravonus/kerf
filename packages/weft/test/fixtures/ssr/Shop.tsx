// The v3 shop's components with data already loaded, for the server render → hydrate round trip (test/ssr.test.ts).
// Same state shape as evals/reference-v3/weft/src/App.tsx; the products arrive as a prop instead of a fetch.
import { derived, state, untrack } from 'weft'
import type { Product } from '../../../../../evals/reference-v3/weft/src/api'
import type { Cart } from '../../../../../evals/reference-v3/weft/src/App'
import { CartView } from '../../../../../evals/reference-v3/weft/src/components/CartView'
import { Header } from '../../../../../evals/reference-v3/weft/src/components/Header'
import { ProductList, type Filters } from '../../../../../evals/reference-v3/weft/src/components/ProductList'

export function Shop(props: { products: Product[]; cart: Cart; filters: Filters }) {
  const cart = state<Cart>(untrack(() => props.cart))
  const filters = state<Filters>(untrack(() => props.filters))
  const tab = state<'products' | 'cart'>('products')
  const count = derived(() => Object.values(cart.value).reduce((n, l) => n + l.qty, 0))
  const change = (id: string, delta: number) => {
    const product = props.products.find(p => p.id === id)!
    const { [id]: line, ...rest } = cart.value
    const qty = (line?.qty ?? 0) + delta
    if (qty > product.stock) return
    cart.value = qty <= 0 ? rest : { ...rest, [id]: { qty, addedPrice: line?.addedPrice ?? product.price } }
  }
  return (
    <main>
      <Header tab={tab.value} count={count.value} onTab={t => (tab.value = t)} />
      <ProductList products={props.products} cart={cart} filters={filters.value} onFilters={f => (filters.value = f)} onAdd={id => change(id, 1)} />
      <CartView products={props.products} cart={cart} onChange={change} />
    </main>
  )
}
