import { state } from '@kerf-js/core'
import {
  Card,
  LineItem,
  Stack,
  Text,
  Toaster,
} from '@kerf-js/veneer'
import { SHOP_CART } from '../../world'

export function LineItemCart() {
  const cart = state(SHOP_CART)
  return (
    <Card>
      <Stack gap="related">
        {cart.value.map((line) => (
          <LineItem
            key={line.id}
            line={line}
            cart={cart}
          />
        ))}
        {cart.value.length === 0 && (
          <Text subtle>Your cart is empty.</Text>
        )}
      </Stack>
      <Toaster />
    </Card>
  )
}
