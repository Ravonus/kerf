import { Link } from '@weft/start'
import { Boundary } from 'weft'
import { cartCount } from '#/server/cart'

function CartCount() {
  const cart = cartCount()
  return <Link href="/cart" class="cart-link">Cart ({cart.value?.count ?? 0})</Link>
}

/** Before the count lands, and if it never does, the way to the cart still works. */
const CartOnly = () => <Link href="/cart" class="cart-link">Cart</Link>

// Its own component, so the island is this Boundary: the compiler then sees the count and runs it as the page shows, where
// from inside the header's <Center> it would wait for a click, and "Add to cart" couldn't reach it.
export function CartLink() {
  return (
    <Boundary pending={<CartOnly />} error={() => <CartOnly />}>
      <CartCount />
    </Boundary>
  )
}
