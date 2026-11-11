import { LockIcon } from '@kerf-js/veneer-icons'
import { Alert } from '../Alert'
import { Button } from '../Button'
import type { CheckoutStep } from './Checkout-types'
import type { CheckoutModel, CheckoutNav } from './Checkout-view'

export function checkoutReview(model: CheckoutModel, Nav: CheckoutNav) {
  const { id, step, placing, newTotal, total, cost } = model.s
  const { edits } = model
  const { pay } = model
  const { go } = model.nav
  return (
    <section
      data-part="step"
      data-step="review"
      data-state={step.value === 'review' ? 'active' : undefined}
      aria-labelledby={`${id}-review`}
    >
      <div data-part="step-body">
        <h2 data-part="step-title" id={`${id}-review`} tabindex="-1">
          Review and pay
        </h2>
        {newTotal.value !== undefined && (
          <Alert tone="caution" title={`The total is now ${cost(newTotal.value)}`}>
            The price changed while you were checking out. Look it over, then pay again.
          </Alert>
        )}
        <dl data-scope="lines">
          {edits.value.map((r) => (
            <div key={r.step}>
              <dt>
                {r.label}
                <br />
                <span>{r.text}</span>
              </dt>
              <dd>
                <Button
                  emphasis="link"
                  aria-label={`Edit ${r.label.toLowerCase()}`}
                  onClick={() => go(r.step as CheckoutStep, 'field', true)}
                >
                  Edit
                </Button>
              </dd>
            </div>
          ))}
        </dl>
        <span class="muted">
          By paying you agree to the terms of sale. You can cancel within 1 hour.
        </span>
        <Nav back="payment">
          <Button size="lg" loading={placing.value} onClick={pay}>
            <LockIcon />
            {`Pay ${cost(total.value)}`}
          </Button>
        </Nav>
      </div>
    </section>
  )
}
