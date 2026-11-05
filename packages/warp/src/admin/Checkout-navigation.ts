// Checkout step changes and address validation.
import { announce, addressProblems } from '@weft-js/warp-core'
import { afterFlush } from './atoms'
import { STEPS } from './Checkout-steps'
import type { CheckoutStep } from './Checkout-types'
import type { CheckoutInput, checkoutState } from './Checkout-state'

type State = ReturnType<typeof checkoutState>

/** Create the step navigation callbacks for one checkout. */
export function checkoutNavigation(input: CheckoutInput, s: State) {
  const {
    step,
    dir,
    refs,
    name,
    email,
    address,
    billing,
    sameBilling,
    nameError,
    emailError,
    addressErrors,
    billingErrors,
    addressAlert,
  } = s
  const stepTitle = (to: CheckoutStep) =>
    to === 'done' ? 'Order confirmed' : STEPS.find((x) => x.id === to)!.title
  const section = (to: CheckoutStep) => refs.root?.querySelector<HTMLElement>(`[data-step="${to}"]`)
  const go = (to: CheckoutStep, focus?: 'field', back?: boolean) => {
    dir.value = back ? 'back' : undefined
    step.value = to
    input.onStepChange(to)
    if (refs.root)
      announce(
        refs.root.ownerDocument,
        to === 'done'
          ? stepTitle(to)
          : `Step ${STEPS.findIndex((x) => x.id === to) + 1} of ${STEPS.length}, ${stepTitle(to)}`,
      )
    afterFlush(() => {
      const node = section(to)
      const field =
        focus &&
        node?.querySelector<HTMLElement>(
          'input:not([type="hidden"]):checked, input:not([type="hidden"]), button[data-part="trigger"]',
        )
      ;(field || node?.querySelector<HTMLElement>('[data-part="step-title"]'))?.focus()
    })
  }
  const prev = (to: CheckoutStep) => go(to, undefined, true)
  const submitAddress = (e: Event) => {
    e.preventDefault()
    nameError.value = name.value.trim() ? '' : 'Enter the name for delivery.'
    emailError.value = !email.value
      ? 'We send the receipt here.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
        ? ''
        : 'That doesn’t look like an email.'
    addressErrors.value = addressProblems(address.value, input.defaultCountry()!)
    billingErrors.value = sameBilling.value
      ? {}
      : addressProblems(billing.value, input.defaultCountry()!)
    const n =
      [nameError.value, emailError.value].filter(Boolean).length +
      Object.keys(addressErrors.value).length +
      Object.keys(billingErrors.value).length
    addressAlert.value = n ? `${n === 1 ? '1 field needs' : `${n} fields need`} attention` : ''
    if (!n) return go('shipping')
    if (refs.root) announce(refs.root.ownerDocument, addressAlert.value)
    afterFlush(() =>
      section('address')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    )
  }
  return { go, prev, submitAddress }
}
