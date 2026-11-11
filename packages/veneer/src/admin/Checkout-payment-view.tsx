import { Alert } from '../Alert'
import { Button } from '../Button'
import type { CheckoutModel, CheckoutNav } from './Checkout-view'

export function checkoutPayment(model: CheckoutModel, Nav: CheckoutNav) {
  const { id, step, declined, paySlot } = model.s
  const { input } = model
  const { go } = model.nav
  return (
    <section
      data-part="step"
      data-step="payment"
      data-state={step.value === 'payment' ? 'active' : undefined}
      aria-labelledby={`${id}-payment`}
    >
      <div data-part="step-body">
        <h2 data-part="step-title" id={`${id}-payment`} tabindex="-1">
          Payment
        </h2>
        {declined.value && (
          <Alert tone="critical" live title="Your card was declined">
            {declined.value} Try another card.
          </Alert>
        )}
        {input.wallet() && (
          <Button emphasis="frame" full onClick={input.wallet()!.onClick}>
            {input.wallet()!.label}
          </Button>
        )}
        {input.wallet() && (
          <div data-scope="auth" data-embedded="">
            <div data-part="divider">or with a card</div>
          </div>
        )}
        {paySlot.value}
        <Nav back="shipping">
          <Button
            onClick={() => {
              declined.value = ''
              go('review')
            }}
          >
            Review order
          </Button>
        </Nav>
      </div>
    </section>
  )
}
