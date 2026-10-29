// The groups version of the v3 shop (spikes/style-groups/shop-groups) with data loaded, for the round trip in test/style.test.tsx.
// Same as Shop.tsx, on the components rewritten with style groups.
import { derived, state, untrack } from 'weft'
import type { Product } from '../../../../../evals/reference-v3/weft/src/api'
import type { Cart } from '../../../../../evals/reference-v3/weft/src/App'
import { CartView } from '../../../../../spikes/style-groups/shop-groups/src/components/CartView'
import { Header } from '../../../../../spikes/style-groups/shop-groups/src/components/Header'
import { ProductList, type Filters } from '../../../../../spikes/style-groups/shop-groups/src/components/ProductList'

export function GroupShop(props: { products: Product[]; cart: Cart; filters: Filters }) {
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
      <ProductList products={props.products} cart={cart.value} filters={filters.value} onFilters={f => (filters.value = f)} onAdd={id => change(id, 1)} />
      <CartView products={props.products} cart={cart.value} onChange={change} />
    </main>
  )
}
