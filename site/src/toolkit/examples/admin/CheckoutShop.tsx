import { state } from '@kerf-js/core'
import { Checkout, Toaster } from '@kerf-js/veneer'
import type { PlaceOrderResult } from '@kerf-js/veneer'
import { SHOP_CART, SHOP_SHIPPING } from '../../world'
import { wait, PAYMENT_FRAME } from './shared'

export function CheckoutShop() {
  const cart = state(SHOP_CART)
  const place = async (): Promise<PlaceOrderResult> => {
    await wait(900)
    return { order: { id: 'T-2041', stage: 'placed' } }
  }
  return (
    <>
      <Checkout
        cart={cart}
        shipping={SHOP_SHIPPING}
        countries={['US', 'GB', 'DE']}
        taxRate={0.08}
        coupon={(code) =>
          code === 'KERF10'
            ? { code, percentOff: 10 }
            : undefined
        }
        payment={<PAYMENT_FRAME />}
        onPlaceOrder={place}
        onContinueShopping={() =>
          (cart.value = SHOP_CART)
        }
      />
      <Toaster />
    </>
  )
}
