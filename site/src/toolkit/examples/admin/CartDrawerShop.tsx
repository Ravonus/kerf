import { state } from '@kerf/core'
import {
  CartButton,
  CartDrawer,
  Stack,
  Text,
  Toaster,
} from '@kerf/veneer'
import { SHOP_CART } from '../../world'

export function CartDrawerShop() {
  const cart = state(SHOP_CART)
  const open = state(false)
  const placed = state(false)
  return (
    <>
      <Stack
        gap="related"
        align="center"
      >
        <CartButton
          count={cart.value.reduce(
            (n, line) => n + line.quantity,
            0,
          )}
          onClick={() => (open.value = true)}
        />
        <Text subtle>
          {placed.value
            ? 'On to checkout.'
            : 'Open the cart, change a quantity.'}
        </Text>
      </Stack>
      <CartDrawer
        open={open}
        cart={cart}
        onCheckout={() => (placed.value = true)}
      />
      <Toaster />
    </>
  )
}
