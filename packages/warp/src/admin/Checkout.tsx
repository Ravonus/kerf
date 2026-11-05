import type { CheckoutProps } from './Checkout-types'
import { checkoutModel } from './Checkout-model'
import { checkoutView } from './Checkout-view'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/flow.css'
import '@weft-js/warp-core/styles/flows/checkout.css'
import '@weft-js/warp-core/styles/flows/choice.css'
import '@weft-js/warp-core/styles/flows/plan-card.css'
import '@weft-js/warp-core/styles/flows/line-item.css'
import '@weft-js/warp-core/styles/flows/lines.css'
import '@weft-js/warp-core/styles/flows/auth.css' // the "or with a card" divider

export type {
  ShippingOption,
  Coupon,
  CheckoutStep,
  OrderDraft,
  PlaceOrderResult,
  CheckoutProps,
} from './Checkout-types'

/**
 * Checkout (09 §6.2): Cart → Address → Shipping → Payment → Review → Confirmation, guest first. Each step's title takes
 * focus and the step is announced; back goes to a step without losing a value. Place order is idempotent by a client
 * key; CARD_DECLINED returns to Payment, OUT_OF_STOCK to Cart with the line marked, PRICE_CHANGED stays on Review.
 */
export function Checkout({
  cart,
  shipping,
  countries,
  defaultCountry = 'US',
  addressProvider,
  taxRate = 0,
  currency,
  locale,
  payment,
  wallet,
  coupon,
  idempotencyKey,
  onPlaceOrder,
  onStepChange,
  onContinueShopping,
  signInHref,
}: CheckoutProps) {
  return checkoutView(
    checkoutModel({
      cart: () => cart,
      shipping: () => shipping,
      countries: () => countries,
      defaultCountry: () => defaultCountry,
      addressProvider: () => addressProvider,
      taxRate: () => taxRate,
      currency: () => currency,
      locale: () => locale,
      payment: () => payment,
      wallet: () => wallet,
      coupon: () => coupon,
      applyCoupon: (code) => coupon?.(code),
      idempotencyKey: () => idempotencyKey,
      onPlaceOrder: (order) => onPlaceOrder(order()),
      onStepChange: (step) => onStepChange?.(step),
      onContinueShopping: () => onContinueShopping,
      signInHref: () => signInHref,
    }),
  )
}
