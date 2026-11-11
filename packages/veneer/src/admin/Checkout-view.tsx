// Render checkout steps in their original order.
import { LeftIcon } from '@kerf/veneer-icons'
import { Button } from '../Button'
import { StepBar } from './StepBar'
import { STEPS } from './Checkout-steps'
import type { CheckoutStep } from './Checkout-types'
import type { checkoutModel } from './Checkout-model'
import { checkoutCart } from './Checkout-cart'
import { checkoutAddress } from './Checkout-address'
import { checkoutShipping } from './Checkout-shipping'
import { checkoutPayment } from './Checkout-payment-view'
import { checkoutReview } from './Checkout-review'
import { checkoutDone } from './Checkout-done'
import { checkoutSummary } from './Checkout-summary'

export type CheckoutModel = ReturnType<typeof checkoutModel>
export type CheckoutNav = (props: { back: CheckoutStep; children: unknown }) => unknown

/** Render the checkout without adding a component owner. */
export function checkoutView(model: CheckoutModel) {
  const { step, dir, refs } = model.s
  const { at, nav } = model
  const Nav = ({ back, children }: { back: CheckoutStep; children: unknown }) => (
    <div data-part="nav">
      <Button emphasis="ghost" tone="neutral" icon={LeftIcon} onClick={() => nav.prev(back)}>
        Back
      </Button>
      {children}
    </div>
  )
  return (
    <div ref={(n) => (refs.root = n)} data-scope="checkout">
      <div data-part="layout">
        <div data-scope="stack">
          {step.value !== 'done' && (
            <StepBar label="Checkout steps" steps={STEPS} current={at.value} />
          )}
          <div data-scope="flow" data-dir={dir.value}>
            {checkoutCart(model)}
            {checkoutAddress(model, Nav)}
            {checkoutShipping(model, Nav)}
            {checkoutPayment(model, Nav)}
            {checkoutReview(model, Nav)}
            {checkoutDone(model)}
          </div>
        </div>
        {checkoutSummary(model)}
      </div>
    </div>
  )
}
