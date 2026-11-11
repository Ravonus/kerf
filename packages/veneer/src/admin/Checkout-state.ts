// Per-instance checkout state and derived pricing.
import { derived, state, untrack } from '@kerf/core'
import {
  cartTotals,
  money,
  openWhenWide,
  uid,
  type Address,
  type AddressPart,
} from '@kerf/veneer-core'
import { use } from '@kerf/veneer-core/kerf'
import type { OrderStage } from './Order'
import type { CheckoutProps, CheckoutStep, Coupon } from './Checkout-types'
import { WIDE } from './Checkout-steps'

/** Live access to checkout props. */
export type CheckoutInput = {
  [K in Exclude<keyof CheckoutProps, 'onStepChange' | 'onPlaceOrder'>]-?: () => CheckoutProps[K]
} & {
  applyCoupon: (code: string) => ReturnType<NonNullable<CheckoutProps['coupon']>> | undefined
  onStepChange: (step: CheckoutStep) => void
  onPlaceOrder: (
    order: () => Parameters<CheckoutProps['onPlaceOrder']>[0],
  ) => ReturnType<CheckoutProps['onPlaceOrder']>
}

/** Create checkout state under the caller's owner. */
export function checkoutState(input: CheckoutInput) {
  const id = uid('co')
  const step = state<CheckoutStep>('cart')
  const dir = state<'back' | undefined>(undefined)
  const ship = state(untrack(() => input.shipping()[0]?.id ?? ''))
  const code = state('')
  const codeError = state('')
  const applied = state<Coupon | undefined>(undefined)
  const checking = state(false)
  const placing = state(false)
  const declined = state('')
  const outOfStock = state('')
  const newTotal = state<number | undefined>(undefined)
  const placed = state<{ id: string; stage?: OrderStage | undefined } | undefined>(undefined)
  const paySlot = derived(input.payment)
  const refs: { root: HTMLElement | undefined; summary: HTMLDetailsElement | undefined } = {
    root: undefined,
    summary: undefined,
  }
  use(
    openWhenWide,
    () => refs.summary,
    () => WIDE,
  )
  const pricing = checkoutPricing(input, { ship, applied, newTotal })
  return {
    id,
    step,
    dir,
    ship,
    code,
    codeError,
    applied,
    checking,
    placing,
    declined,
    outOfStock,
    newTotal,
    placed,
    paySlot,
    refs,
    ...contactState(),
    ...pricing,
  }
}

function contactState() {
  const name = state('')
  const email = state('')
  const phone = state('')
  const address = state<Address | null>(null)
  const billing = state<Address | null>(null)
  const sameBilling = state(true)
  const nameError = state('')
  const emailError = state('')
  const addressErrors = state<Partial<Record<AddressPart, string>>>({})
  const billingErrors = state<Partial<Record<AddressPart, string>>>({})
  const addressAlert = state('')
  return {
    name,
    email,
    phone,
    address,
    billing,
    sameBilling,
    nameError,
    emailError,
    addressErrors,
    billingErrors,
    addressAlert,
  }
}

function checkoutPricing(
  input: CheckoutInput,
  fields: {
    ship: ReturnType<typeof state<string>>
    applied: ReturnType<typeof state<Coupon | undefined>>
    newTotal: ReturnType<typeof state<number | undefined>>
  },
) {
  const { ship, applied, newTotal } = fields
  const lines = derived(() => input.cart().value)
  const option = derived(() => input.shipping().find((o) => o.id === ship.value))
  const totals = derived(() =>
    cartTotals(lines.value, {
      shipping: option.value?.price ?? 0,
      percentOff: applied.value?.percentOff,
      taxRate: input.taxRate()!,
    }),
  )
  const total = derived(() => newTotal.value ?? totals.value.total)
  const cost = (n: number) => money(n, input.currency(), input.locale())
  return { lines, option, totals, total, cost }
}
