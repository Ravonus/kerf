import { OrderConfirmation } from './Order'
import type { CheckoutModel } from './Checkout-view'

export function checkoutDone(model: CheckoutModel) {
  const { id, step, email, placed, option } = model.s
  const { input } = model
  return (
    <section
      data-part="step"
      data-step="done"
      data-state={step.value === 'done' ? 'active' : undefined}
      aria-labelledby={`${id}-done`}
    >
      {placed.value && (
        <OrderConfirmation
          titleId={`${id}-done`}
          orderId={placed.value.id}
          email={email.value}
          stage={placed.value.stage}
          note={`${option.value?.name ?? ''} delivery. ${option.value?.eta ?? ''}.`}
          onContinue={input.onContinueShopping()}
        />
      )}
    </section>
  )
}
