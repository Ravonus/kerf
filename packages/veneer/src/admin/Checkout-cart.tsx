import { Alert } from '../Alert'
import { Button } from '../Button'
import { LineItem } from './Cart'
import type { CheckoutModel } from './Checkout-view'

export function checkoutCart(model: CheckoutModel) {
  const { id, step, outOfStock, lines } = model.s
  const { input } = model
  const live = {
    get cart() {
      return input.cart()
    },
    get currency() {
      return input.currency()
    },
    get locale() {
      return input.locale()
    },
    get onContinueShopping() {
      return input.onContinueShopping()
    },
  }
  const { count } = model
  const { go } = model.nav
  return (
    <section
      data-part="step"
      data-step="cart"
      data-state={step.value === 'cart' ? 'active' : undefined}
      aria-labelledby={`${id}-cart`}
    >
      <div data-part="step-body">
        <h2 data-part="step-title" id={`${id}-cart`} tabindex="-1">
          Your cart
        </h2>
        {input.signInHref() && (
          <span class="muted">
            Checking out as a guest. <a href={input.signInHref()}>Sign in</a>
          </span>
        )}
        {outOfStock.value && (
          <Alert tone="critical" live title="Part of your order just sold out">
            Remove the marked line to continue.
          </Alert>
        )}
        {lines.value.length ? (
          lines.value.map((l) => (
            <LineItem
              key={l.id}
              line={l}
              cart={live.cart}
              currency={live.currency}
              locale={live.locale}
              problem={l.id === outOfStock.value ? 'Out of stock' : undefined}
            />
          ))
        ) : (
          <span class="muted">Your cart is empty.</span>
        )}
        <div data-part="nav">
          {live.onContinueShopping ? (
            <Button emphasis="link" onClick={live.onContinueShopping}>
              Continue shopping
            </Button>
          ) : (
            <span></span>
          )}
          <Button
            disabled={!count.value || lines.value.some((l) => l.id === outOfStock.value)}
            onClick={() => go('address')}
          >
            Continue to address
          </Button>
        </div>
      </div>
    </section>
  )
}
