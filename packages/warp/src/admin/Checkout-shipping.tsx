import { Button } from '../Button'
import { Sweep } from './atoms'
import type { CheckoutModel, CheckoutNav } from './Checkout-view'

export function checkoutShipping(model: CheckoutModel, Nav: CheckoutNav) {
  const { id, step, ship, cost } = model.s
  const { input } = model
  const { go } = model.nav
  return (
    <section
      data-part="step"
      data-step="shipping"
      data-state={step.value === 'shipping' ? 'active' : undefined}
      aria-labelledby={`${id}-shipping`}
    >
      <div data-part="step-body">
        <h2 data-part="step-title" id={`${id}-shipping`} tabindex="-1">
          How fast?
        </h2>
        <fieldset data-scope="choice">
          <legend data-part="sr-only">Shipping speed</legend>
          {input.shipping().map((o) => (
            <label key={o.id} data-scope="plan-card" data-sweep="">
              <Sweep />
              <input
                type="radio"
                name={`${id}-ship`}
                value={o.id}
                checked={o.id === ship.value}
                onChange={() => (ship.value = o.id)}
              />
              <span data-part="radio" aria-hidden="true"></span>
              <span>
                <b>{o.name}</b>
                <small>{o.eta}</small>
              </span>
              <b>{o.price ? cost(o.price) : 'Free'}</b>
            </label>
          ))}
        </fieldset>
        <Nav back="address">
          <Button onClick={() => go('payment')}>Continue to payment</Button>
        </Nav>
      </div>
    </section>
  )
}
