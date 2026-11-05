// Submit an order with a per-checkout idempotency key.
import { announce, errorStep, newOrderKey } from '@weft-js/warp-core'
import { toast } from '../Toast'
import type { CheckoutInput, checkoutState } from './Checkout-state'
import type { checkoutNavigation } from './Checkout-navigation'

/** Create the payment callback for one checkout. */
export function checkoutPayment(
  input: CheckoutInput,
  s: ReturnType<typeof checkoutState>,
  nav: ReturnType<typeof checkoutNavigation>,
) {
  const {
    placing,
    address,
    lines,
    name,
    email,
    phone,
    sameBilling,
    billing,
    ship,
    applied,
    total,
    placed,
    declined,
    outOfStock,
    newTotal,
    cost,
    refs,
  } = s
  const { go } = nav
  let key: string | undefined
  const pay = async () => {
    if (placing.value) return // a double tap: the first press owns the key
    placing.value = true
    const useKey = input.idempotencyKey() ?? (key ??= newOrderKey())
    const a = address.value!
    try {
      const r = await input.onPlaceOrder()({
        lines: lines.value,
        name: name.value,
        email: email.value,
        phone: phone.value,
        address: a,
        billing: sameBilling.value ? a : billing.value!,
        shipping: ship.value,
        coupon: applied.value?.code,
        total: total.value,
        idempotencyKey: useKey,
      })
      if ('order' in r) {
        placed.value = r.order
        key = undefined
        return go('done')
      }
      key = undefined // a definite answer: the next attempt is a new one
      const err = r.error
      declined.value = err.code === 'CARD_DECLINED' ? err.reason : ''
      outOfStock.value = err.code === 'OUT_OF_STOCK' ? err.sku : ''
      newTotal.value = err.code === 'PRICE_CHANGED' ? err.total : undefined
      if (err.code === 'PRICE_CHANGED') {
        if (refs.root)
          announce(refs.root.ownerDocument, `The total changed to ${cost(err.total)}`, true)
        return
      }
      go(errorStep(err), undefined, true)
    } catch {
      toast.show({
        title: 'We couldn’t reach the store',
        description: 'You weren’t charged twice. Try again.',
        tone: 'critical',
        action: { label: 'Retry', onClick: pay },
      })
    } finally {
      placing.value = false
    }
  }
  return pay
}
