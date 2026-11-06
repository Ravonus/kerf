import { shopState } from './shop-state'
import { productView } from './products'
import { cartView } from './cart'

export default function Home() {
  const m = shopState()
  return (
    <main>
      <h1>Shop</h1>
      <button
        onClick={() => {
          m.tab.value = 'Products'
        }}
      >
        Products
      </button>
      <button
        onClick={() => {
          m.tab.value = 'Cart'
        }}
      >
        Cart ({m.count.value})
      </button>
      {m.tab.value === 'Products' ? productView(m) : cartView(m)}
    </main>
  )
}
