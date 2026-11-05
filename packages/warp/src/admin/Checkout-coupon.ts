// Applying and undoing checkout coupons.
import { toast } from '../Toast'
import type { CheckoutInput, checkoutState } from './Checkout-state'

/** Create coupon callbacks for one checkout. */
export function checkoutCoupon(input: CheckoutInput, s: ReturnType<typeof checkoutState>) {
  const { code, codeError, checking, applied } = s
  const apply = async (e: Event) => {
    e.preventDefault()
    const v = code.value.trim().toUpperCase()
    if (!v) return void (codeError.value = 'Enter a code first.')
    checking.value = true
    const c = await input.applyCoupon(v)
    checking.value = false
    if (!c) return void (codeError.value = 'That code isn’t valid or has expired.')
    applied.value = c
    code.value = ''
    codeError.value = ''
    toast.show({
      title: `${c.code} applied`,
      description: `${c.percentOff}% off your items.`,
      tone: 'positive',
    })
  }
  const unapply = () => {
    const c = applied.value!
    applied.value = undefined
    toast.show({
      title: `${c.code} removed`,
      action: { label: 'Undo', onClick: () => (applied.value = c) },
    })
  }
  return { apply, unapply }
}
