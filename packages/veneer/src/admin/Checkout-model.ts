// Compose the state and callbacks for one checkout.
import { derived } from '@kerf/core'
import { cartCount } from '@kerf/veneer-core'
import { checkoutState, type CheckoutInput } from './Checkout-state'
import { checkoutNavigation } from './Checkout-navigation'
import { checkoutCoupon } from './Checkout-coupon'
import { checkoutPayment } from './Checkout-payment'
import { STEPS } from './Checkout-steps'

/** Create the checkout model under the caller's owner. */
export function checkoutModel(input: CheckoutInput) {
  const s = checkoutState(input)
  const { step, name, address, option, lines } = s
  const at = derived(() => STEPS.findIndex((item) => item.id === step.value))
  const nav = checkoutNavigation(input, s)
  const coupon = checkoutCoupon(input, s)
  const pay = checkoutPayment(input, s, nav)
  const edits = derived(() => [
    {
      step: 'address',
      label: 'Ship to',
      text: `${name.value}, ${[address.value?.lines[0], address.value?.locality, address.value?.postalCode].filter(Boolean).join(', ')}`,
    },
    {
      step: 'shipping',
      label: 'Delivery',
      text: `${option.value?.name ?? ''} · ${option.value?.eta ?? ''}`,
    },
    { step: 'payment', label: 'Payment', text: 'Card from your provider' },
  ])
  const count = derived(() => cartCount(lines.value))
  return { input, s, at, nav, coupon, pay, edits, count }
}
