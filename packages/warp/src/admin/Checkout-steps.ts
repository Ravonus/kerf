import type { CheckoutStep } from './Checkout-types'

export const STEPS: { id: CheckoutStep; title: string }[] = [
  { id: 'cart', title: 'Cart' },
  { id: 'address', title: 'Address' },
  { id: 'shipping', title: 'Shipping' },
  { id: 'payment', title: 'Payment' },
  { id: 'review', title: 'Review' },
]
export const WIDE = 860
