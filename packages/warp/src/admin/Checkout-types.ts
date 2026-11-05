// Public checkout data and callbacks.
import type { Address, CartLine, CheckoutError } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import type { AddressProvider } from '../PlaceField'
import type { OrderStage } from './Order'

/** A way to ship an order. */
export type ShippingOption = {
  id: string
  name: string
  /** "Arrives Thu 6 Nov" */ eta: string
  price: number
}
/** A valid coupon and what it takes off. */
export type Coupon = { code: string; percentOff: number }
/** Where a checkout stands. */
export type CheckoutStep = 'cart' | 'address' | 'shipping' | 'payment' | 'review' | 'done'
/** Everything the buyer entered, handed over to place the order. */
export type OrderDraft = {
  lines: CartLine[]
  name: string
  email: string
  phone: string
  address: Address
  billing: Address
  shipping: string
  coupon?: string | undefined
  total: number
  idempotencyKey: string
}
/** What placing an order came back with: the order, or why not. */
export type PlaceOrderResult =
  | { order: { id: string; stage?: OrderStage | undefined } }
  | { error: CheckoutError }

/** Props for Checkout. */
export interface CheckoutProps {
  cart: State<CartLine[]>
  shipping: ShippingOption[]
  countries?: string[] | undefined
  defaultCountry?: string
  addressProvider?: AddressProvider
  taxRate?: number
  /** The ISO 4217 code prices are shown in, such as `EUR`. */
  currency?: string
  locale?: string
  /** The Payment step's body: a PayFrame, in a provider's slot. warp never renders card fields. */
  payment: unknown
  /** The saved wallet's frame button, above the divider. */
  wallet?: { label: string; onClick: () => void }
  /** Checks a code; resolve undefined when it isn't valid. */
  coupon?: (code: string) => Promise<Coupon | undefined> | Coupon | undefined
  /** The client's key for this attempt. Without one a key is made; a retry after a timeout resends it. */
  idempotencyKey?: string | undefined
  /** Throw on a transport failure: values stay, a Toast offers Retry with the same key. */
  onPlaceOrder: (order: OrderDraft) => Promise<PlaceOrderResult>
  onStepChange?: ((step: CheckoutStep) => void) | undefined
  onContinueShopping?: () => void
  signInHref?: string
}
